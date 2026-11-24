'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, BaseWindow, WebContentsView, ipcMain, powerSaveBlocker, screen } = require('electron');
const { configPath, parseConfig, parseItems, replaceItems } = require('./config');
const { Rotation } = require('./rotation');
const { createWebServer } = require('./web');

const OVERLAY_HEIGHT = 72;
const SCREENSHOT_WIDTH = 960;
const OVERLAY_IDLE_MS = 5000;
const TICK_MS = 250;
const RETRY_MS = 30000;
const CRASH_RELOAD_MS = 5000;

const log = (msg) => console.log(`kiosk-rotator: ${msg}`);

// Muted videos may start on their own; the screen has nobody to click "play".
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const CONFIG_FILE = configPath(process.argv, process.env);

function loadConfig() {
  try {
    return parseConfig(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (err) {
    console.error(`kiosk-rotator: ${CONFIG_FILE}: ${err.message}`);
    process.exit(1);
  }
}

// Replaces the items in the config file, keeping the rest of it; written to a
// temporary file and renamed, so a crash never leaves half a file.
function storeItems(items) {
  const text = replaceItems(fs.readFileSync(CONFIG_FILE, 'utf8'), items);
  const tmp = `${CONFIG_FILE}.tmp`;
  fs.writeFileSync(tmp, text, { mode: fs.statSync(CONFIG_FILE).mode });
  fs.renameSync(tmp, CONFIG_FILE);
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
  wc.on('destroyed', () => clearTimeout(retry));
  wc.on('unresponsive', () => {
    log(`${item.url}: unresponsive, restarting its renderer`);
    wc.forcefullyCrashRenderer();
  });

  load();
  return view;
}

function start({ items, web }) {
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

  let pages = [];
  let rotation;

  const overlay = new WebContentsView({
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  overlay.setBackgroundColor('#00000000');
  overlay.webContents.loadFile(path.join(__dirname, 'overlay.html'));
  overlay.setVisible(false);

  const layout = () => {
    const { width, height } = win.getContentBounds();
    for (const view of pages) view.setBounds({ x: 0, y: 0, width, height });
    overlay.setBounds({ x: 0, y: height - OVERLAY_HEIGHT, width, height: OVERLAY_HEIGHT });
  };
  win.on('resize', layout);

  const show = () => pages.forEach((view, i) => view.setVisible(i === rotation.index));

  // A page whose URL is still in the new list keeps its view, so it is not
  // reloaded; the rotation starts over at the first item.
  const setItems = (list) => {
    const old = pages.map((view, i) => ({ view, url: items[i] && items[i].url }));
    pages = list.map((item) => {
      const kept = old.findIndex((o) => o.url === item.url);
      return kept >= 0 ? old.splice(kept, 1)[0].view : createPage(item);
    });
    for (const { view } of old) {
      win.contentView.removeChildView(view);
      view.webContents.close();
    }
    items = list;
    for (const view of pages) win.contentView.addChildView(view); // re-adding moves to the top
    win.contentView.addChildView(overlay); // last: drawn over the pages
    rotation = new Rotation(items, Date.now());
    layout();
    show();
  };
  setItems(items);
  win.show();

  const state = (now) => ({
    index: rotation.index,
    count: items.length,
    title: pages[rotation.index].webContents.getTitle(),
    url: items[rotation.index].url,
    remainingMs: rotation.remainingMs(now),
    durationMs: rotation.durationMs(),
    paused: rotation.paused,
  });

  // The pages swallow mouse events, so cursor movement is polled instead: the
  // control bar shows while the mouse moves and while the rotation is paused.
  let lastCursor = null;
  let lastMove = 0;

  // From the control bar and from the web page; either one brings the bar up.
  const command = (name) => {
    const now = Date.now();
    if (name === 'next') rotation.go(1, now);
    else if (name === 'prev') rotation.go(-1, now);
    else if (name === 'pause') rotation.togglePause(now);
    else return;
    lastMove = now;
    show();
  };
  ipcMain.on('command', (event, name) => {
    if (event.sender === overlay.webContents) command(name);
  });

  createWebServer({
    web,
    getItems: () => items,
    saveItems: (list) => {
      const valid = parseItems(list);
      storeItems(valid);
      setItems(valid);
      log(`rotating ${valid.length} page(s), set from the web page`);
    },
    getState: () => state(Date.now()),
    // The page on screen, without the control bar; scaled down, since the web
    // page polls it every second.
    screenshot: async () => {
      const image = await pages[rotation.index].webContents.capturePage();
      const { width } = image.getSize();
      return (width > SCREENSHOT_WIDTH ? image.resize({ width: SCREENSHOT_WIDTH }) : image).toJPEG(70);
    },
    command,
  })
    .on('error', (err) => log(`web page on ${web.listen}:${web.port}: ${err.message}`))
    .listen(web.port, web.listen, () => log(`web page on http://${web.listen}:${web.port}/`));

  setInterval(() => {
    const now = Date.now();
    if (rotation.tick(now)) show();

    const cursor = screen.getCursorScreenPoint();
    if (lastCursor && (cursor.x !== lastCursor.x || cursor.y !== lastCursor.y)) lastMove = now;
    lastCursor = cursor;
    const visible = rotation.paused || now - lastMove < OVERLAY_IDLE_MS;
    overlay.setVisible(visible);
    if (!visible) return;

    overlay.webContents.send('state', state(now));
  }, TICK_MS);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  const config = loadConfig();
  log(`rotating ${config.items.length} page(s)`);
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(() => start(config));
}
