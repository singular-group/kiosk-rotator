'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword } = require('../src/auth');
const { parseItems } = require('../src/config');
const { createWebServer } = require('../src/web');

const auth = `Basic ${Buffer.from('admin:pw').toString('base64')}`;

async function withServer(fn) {
  let items = [{ url: 'https://a.example/', seconds: 10 }];
  const commands = [];
  const server = createWebServer({
    web: { user: 'admin', passwordHash: hashPassword('pw') },
    getItems: () => items,
    saveItems: (list) => (items = parseItems(list)),
    getState: () => ({ index: 0, count: items.length, commands: commands.length }),
    screenshot: async () => Buffer.from('jpeg'),
    command: (name) => commands.push(name),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base, () => items, commands);
  } finally {
    server.close();
  }
}

test('web: everything needs the user and password', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/items`);
    assert.equal(res.status, 401);
    assert.match(res.headers.get('www-authenticate'), /^Basic /);
    assert.equal((await fetch(`${base}/`)).status, 401);
  });
});

test('web: serves the page and the list', async () => {
  await withServer(async (base) => {
    const page = await fetch(`${base}/`, { headers: { authorization: auth } });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<title>kiosk-rotator<\/title>/);
    const res = await fetch(`${base}/api/items`, { headers: { authorization: auth } });
    assert.deepEqual(await res.json(), { items: [{ url: 'https://a.example/', seconds: 10 }] });
  });
});

test('web: saves a valid list and refuses an invalid one', async () => {
  await withServer(async (base, current) => {
    const put = (body, type = 'application/json') =>
      fetch(`${base}/api/items`, { method: 'PUT', headers: { authorization: auth, 'content-type': type }, body });

    const ok = await put(JSON.stringify({ items: [{ url: 'https://b.example/', seconds: 5 }] }));
    assert.equal(ok.status, 200);
    assert.deepEqual(current(), [{ url: 'https://b.example/', seconds: 5 }]);

    const bad = await put(JSON.stringify({ items: [{ url: 'file:///etc/passwd', seconds: 5 }] }));
    assert.equal(bad.status, 400);
    assert.match((await bad.json()).error, /http or https/);
    assert.deepEqual(current(), [{ url: 'https://b.example/', seconds: 5 }]);

    assert.equal((await put('{"items":[]}', 'text/plain')).status, 415);
  });
});

test('web: reports the screen and runs its commands', async () => {
  await withServer(async (base, _items, commands) => {
    const state = await fetch(`${base}/api/state`, { headers: { authorization: auth } });
    assert.deepEqual(await state.json(), { index: 0, count: 1, commands: 0 });
    const shot = await fetch(`${base}/api/screen.jpg`, { headers: { authorization: auth } });
    assert.equal(shot.headers.get('content-type'), 'image/jpeg');
    assert.equal(await shot.text(), 'jpeg');

    const post = (body, type = 'application/json') =>
      fetch(`${base}/api/command`, { method: 'POST', headers: { authorization: auth, 'content-type': type }, body });

    for (const name of ['next', 'prev', 'pause']) assert.equal((await post(JSON.stringify({ command: name }))).status, 200);
    assert.deepEqual(commands, ['next', 'prev', 'pause']);

    const bad = await post(JSON.stringify({ command: 'reload' }));
    assert.equal(bad.status, 400);
    assert.match((await bad.json()).error, /one of prev, pause, next/);
    assert.equal((await post('{"command":"next"}', 'text/plain')).status, 415);
    assert.equal((await fetch(`${base}/api/command`, { method: 'POST' })).status, 401);
    assert.deepEqual(commands, ['next', 'prev', 'pause']);
  });
});
