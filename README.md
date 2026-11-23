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
`~/.config/kiosk-rotator/config.json`. The file is read once at start; restart
the app to apply changes. An invalid file makes the app exit with a message
naming the offending field.

Cookies and site data persist in `~/.config/kiosk-rotator`, so a page you log
into once stays logged in.

## Running

```sh
tar xzf kiosk-rotator-<version>-linux-x64.tar.gz
./kiosk-rotator-linux-x64/kiosk-rotator --config=/path/to/config.json
```

On Ubuntu 23.10 and later, AppArmor blocks the unprivileged user namespaces
Chromium's sandbox needs. Either install an AppArmor profile for the binary
(needs root) or add `--no-sandbox`; the latter is reasonable when the URL list
is your own.

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
