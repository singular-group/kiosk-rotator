'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { checkBasicAuth } = require('./auth');

const MAX_BODY = 64 * 1024;
const FAIL_DELAY_MS = 1000; // slows down password guessing

const COMMANDS = ['prev', 'pause', 'next'];

// The page to edit the list and drive the screen, behind HTTP Basic auth.
// getItems() returns the current list; saveItems(list) validates, stores and
// applies it, throwing an Error whose message is shown to the user when the
// list is invalid. getState() returns what is on screen and screenshot()
// resolves to a JPEG of it; command(name) runs one of COMMANDS, as the
// on-screen control bar does.
function createWebServer({ web, getItems, saveItems, getState, screenshot, command }) {
  const page = fs.readFileSync(path.join(__dirname, 'web.html'));

  const send = (res, status, type, body, headers = {}) => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...headers });
    res.end(body);
  };
  const json = (res, status, data) => send(res, status, 'application/json', JSON.stringify(data));

  return http.createServer((req, res) => {
    if (!checkBasicAuth(req.headers.authorization, web.user, web.passwordHash)) {
      setTimeout(() => {
        send(res, 401, 'text/plain', 'Authentication required\n', {
          'WWW-Authenticate': 'Basic realm="kiosk-rotator", charset="UTF-8"',
        });
      }, req.headers.authorization ? FAIL_DELAY_MS : 0);
      return;
    }

    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/') {
      send(res, 200, 'text/html; charset=utf-8', page);
    } else if (req.method === 'GET' && url.pathname === '/api/items') {
      json(res, 200, { items: getItems() });
    } else if (req.method === 'GET' && url.pathname === '/api/state') {
      json(res, 200, getState());
    } else if (req.method === 'GET' && url.pathname === '/api/screen.jpg') {
      screenshot().then(
        (jpeg) => send(res, 200, 'image/jpeg', jpeg),
        (err) => json(res, 503, { error: err.message }),
      );
    } else if (
      (req.method === 'PUT' && url.pathname === '/api/items') ||
      (req.method === 'POST' && url.pathname === '/api/command')
    ) {
      // A JSON content type cannot be sent cross-origin without a CORS
      // preflight, which this server never grants.
      if (!/^application\/json\b/.test(req.headers['content-type'] || '')) {
        json(res, 415, { error: 'expected application/json' });
        return;
      }
      let body = '';
      let tooLarge = false;
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > MAX_BODY) {
          tooLarge = true;
          req.destroy();
        }
      });
      req.on('end', () => {
        if (tooLarge) return;
        try {
          const data = JSON.parse(body);
          if (url.pathname === '/api/command') {
            const name = data && data.command;
            if (!COMMANDS.includes(name)) throw new Error(`command must be one of ${COMMANDS.join(', ')}`);
            command(name);
            json(res, 200, getState());
          } else {
            saveItems(data && data.items);
            json(res, 200, { items: getItems() });
          }
        } catch (err) {
          json(res, 400, { error: err.message });
        }
      });
    } else {
      json(res, 404, { error: 'not found' });
    }
  });
}

module.exports = { createWebServer };
