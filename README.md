# kiosk-rotator

A full-screen kiosk for wall screens: it shows a list of web pages one after
another, each for its own number of seconds.

- Every page is a top-level browser view, so sites that refuse to be framed
  (`X-Frame-Options`, `frame-ancestors`) work — Grafana, most SaaS dashboards.
- All pages load up front and stay loaded: switching is instant, and logins,
  scroll position and video playback survive between rotations.
- A failed load is retried every 30 s; a crashed or hung page is reloaded.
- Moving the mouse brings up a control bar (previous, pause, next, the page
  title and its remaining time); it hides again after a few seconds of no
  movement, and stays while paused.
- The display is kept from sleeping, and muted videos autoplay.

Built on [Electron](https://www.electronjs.org/). Linux x64 builds are on the
[releases page](https://github.com/singular-group/kiosk-rotator/releases).

## Configuration

A JSON file with the pages and their seconds:

```json
{
  "items": [
    { "url": "https://example.com/dashboard", "seconds": 45 },
    { "url": "https://example.com/status", "seconds": 20 }
  ]
}
```

It is read from `--config=<file>`, else `$KIOSK_ROTATOR_CONFIG`, else
`~/.config/kiosk-rotator/config.json`. The file is read at start; edits made to
it by hand apply on the next start. An invalid file makes the app exit with a
message naming the offending field.

### The web page

The app serves a page that shows the screen and edits the list. At the top, a
live view of the page on screen (refreshed every second), its title and
remaining time, and the same previous, pause and next buttons as the control
bar; using them also brings the bar up on the screen. Below, the list: add,
remove and reorder pages and change their seconds. Saving applies the list at once — pages still in it keep
running without a reload — and writes it back to the config file, so the file
must be writable by the app. Only `items` is rewritten; everything else in the
file stays as it is.

By default it listens on **`http://127.0.0.1:8080/`**, user **`admin`**,
password **`kiosk-rotator`**. Change them in the file's `web` section; any
field left out keeps its default:

```json
{
  "items": [ … ],
  "web": {
    "listen": "0.0.0.0",
    "port": 8080,
    "user": "admin",
    "passwordHash": "scrypt$…"
  }
}
```

`passwordHash` is printed by `hash-password.js`, which reads the password from
standard input. From a release:

```sh
printf %s 'new password' | ELECTRON_RUN_AS_NODE=1 \
  ./kiosk-rotator-linux-x64/kiosk-rotator \
  kiosk-rotator-linux-x64/resources/app.asar/src/hash-password.js
```

From a checkout: `printf %s 'new password' | node src/hash-password.js`.
Restart the app after changing `web`.

The page is plain HTTP with Basic authentication: on any `listen` other than
`127.0.0.1` the password crosses the network in clear, and whoever has it
decides which pages the screen loads — weigh that against running with
`--no-sandbox` (see *Running*).

Cookies and site data persist in `~/.config/kiosk-rotator`, so a page you log
into once stays logged in.

## Running

```sh
tar xzf kiosk-rotator-<version>-linux-x64.tar.gz
./kiosk-rotator-linux-x64/kiosk-rotator --config=/path/to/config.json
```

On Ubuntu 23.10 and later, AppArmor blocks the unprivileged user namespaces
Chromium's sandbox needs. Either install an AppArmor profile for the binary
(needs root) or add `--no-sandbox`; the latter is reasonable when only you
decide the URL list — that is, when nobody else can reach the web page.

As a systemd user service that starts with the desktop session:

```ini
# ~/.config/systemd/user/kiosk-rotator.service
[Unit]
Description=kiosk-rotator
PartOf=graphical-session.target
After=graphical-session.target

[Service]
ExecStart=%h/kiosk-rotator-linux-x64/kiosk-rotator --config=%h/.config/kiosk-rotator/config.json
Restart=always
RestartSec=10

[Install]
WantedBy=graphical-session.target
```

```sh
systemctl --user enable --now kiosk-rotator
```

## Development

```sh
npm ci
npm test
npm start -- --config=examples/config.json
npm run package     # out/kiosk-rotator-linux-x64/
```

Pushing a `v<version>` tag matching `package.json` builds the release.

## License

[MIT](LICENSE)
