'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, BaseWindow, WebContentsView, ipcMain, powerSaveBlocker, screen } = require('electron');
const { configPath, parseConfig } = require('./config');
const { Rotation } = require('./rotation');

const OVERLAY_HEIGHT = 72;
const OVERLAY_IDLE_MS = 5000;
const TICK_MS = 250;
const RETRY_MS = 30000;
const CRASH_RELOAD_MS = 5000;

const log = (msg) => console.log(`kiosk-rotator: ${msg}`);

// Muted videos may start on their own; the screen has nobody to click "play".
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function loadItems() {
  const file = configPath(process.argv, process.env);
  try {
    return parseConfig(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`kiosk-rotator: ${file}: ${err.message}`);
    process.exit(1);
  }
}

// One view per item, all loaded up front, so switching is instant and pages
// keep their state (logins, video position) across rotations.
function createPage(item) {
  const view = new WebContentsView({ webPreferences: { backgroundThrottling: false } });
  view.setBackgroundColor('#000000');
  const wc = view.webContents;
  let retry;
  const load = () => {
    clearTimeout(retry);
    wc.loadURL(item.url).catch(() => {}); // failures arrive via did-fail-load
  };
  const reloadIn = (ms) => {
    clearTimeout(retry);
    retry = setTimeout(load, ms);
  };

  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('did-fail-load', (_e, code, desc, _url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3: aborted by a newer navigation
    log(`${item.url}: ${desc} (${code}), retrying in ${RETRY_MS / 1000}s`);
    reloadIn(RETRY_MS);
  });
  wc.on('render-process-gone', (_e, details) => {
    log(`${item.url}: renderer gone (${details.reason}), reloading`);
    reloadIn(CRASH_RELOAD_MS);
  });
  wc.on('unresponsive', () => {
    log(`${item.url}: unresponsive, restarting its renderer`);
    wc.forcefullyCrashRenderer();
  });

  load();
  return view;
}

function start(items) {
  powerSaveBlocker.start('prevent-display-sleep');

  // Mutter ignores kiosk/fullscreen requested before the window is mapped, so
  // it is set again once shown; an undecorated window the size of the monitor
  // is also treated as full screen by it.
  const win = new BaseWindow({
    ...screen.getPrimaryDisplay().bounds,
    show: false,
    frame: false,
    kiosk: true,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    title: 'kiosk-rotator',
  });
  win.once('show', () => setTimeout(() => win.setKiosk(true), 500));

  const pages = items.map((item) => {
    const view = createPage(item);
    win.contentView.addChildView(view);
    return view;
  });

  const overlay = new WebContentsView({
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  overlay.setBackgroundColor('#00000000');
  overlay.webContents.loadFile(path.join(__dirname, 'overlay.html'));
  win.contentView.addChildView(overlay); // added last: drawn on top
  overlay.setVisible(false);

  const layout = () => {
    const { width, height } = win.getContentBounds();
    for (const view of pages) view.setBounds({ x: 0, y: 0, width, height });
    overlay.setBounds({ x: 0, y: height - OVERLAY_HEIGHT, width, height: OVERLAY_HEIGHT });
  };
  win.on('resize', layout);
  layout();
  win.show();

  const rotation = new Rotation(items, Date.now());
  const show = () => pages.forEach((view, i) => view.setVisible(i === rotation.index));
  show();

  // The pages swallow mouse events, so cursor movement is polled instead: the
  // control bar shows while the mouse moves and while the rotation is paused.
  let lastCursor = null;
  let lastMove = 0;

  ipcMain.on('command', (event, name) => {
    if (event.sender !== overlay.webContents) return;
    const now = Date.now();
    if (name === 'next') rotation.go(1, now);
    else if (name === 'prev') rotation.go(-1, now);
    else if (name === 'pause') rotation.togglePause(now);
    else return;
    lastMove = now;
    show();
  });

  setInterval(() => {
    const now = Date.now();
    if (rotation.tick(now)) show();

    const cursor = screen.getCursorScreenPoint();
    if (lastCursor && (cursor.x !== lastCursor.x || cursor.y !== lastCursor.y)) lastMove = now;
    lastCursor = cursor;
    const visible = rotation.paused || now - lastMove < OVERLAY_IDLE_MS;
    overlay.setVisible(visible);
    if (!visible) return;

    const page = pages[rotation.index].webContents;
    overlay.webContents.send('state', {
      index: rotation.index,
      count: items.length,
      title: page.getTitle(),
      url: items[rotation.index].url,
      remainingMs: rotation.remainingMs(now),
      durationMs: rotation.durationMs(),
      paused: rotation.paused,
    });
  }, TICK_MS);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  const items = loadItems();
  log(`rotating ${items.length} page(s)`);
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(() => start(items));
}
