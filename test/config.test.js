'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_CONFIG, DEFAULT_WEB, configPath, parseConfig, replaceItems } = require('../src/config');

test('configPath: flag, then environment, then default', () => {
  assert.equal(configPath(['x', '--config=/a.json'], {}), '/a.json');
  assert.equal(configPath(['x', '--config', '/b.json'], {}), '/b.json');
  assert.equal(configPath(['x'], { KIOSK_ROTATOR_CONFIG: '/c.json' }), '/c.json');
  assert.equal(configPath(['x'], {}), DEFAULT_CONFIG);
});

test('parseConfig: accepts a valid list', () => {
  const { items, web } = parseConfig('{"items":[{"url":"https://example.com/a?b=1","seconds":30}]}');
  assert.deepEqual(items, [{ url: 'https://example.com/a?b=1', seconds: 30 }]);
  assert.deepEqual(web, DEFAULT_WEB);
});

test('parseConfig: rejects bad input with the offending field', () => {
  const cases = [
    ['nope', /not valid JSON/],
    ['{}', /non-empty list/],
    ['{"items":[]}', /non-empty list/],
    ['{"items":[1]}', /items\[0\] must be an object/],
    ['{"items":[{"url":"not a url","seconds":5}]}', /items\[0\]\.url is not a valid URL/],
    ['{"items":[{"url":"file:///etc/passwd","seconds":5}]}', /http or https/],
    ['{"items":[{"url":"https://a.b","seconds":0}]}', /items\[0\]\.seconds/],
    ['{"items":[{"url":"https://a.b","seconds":"10"}]}', /items\[0\]\.seconds/],
  ];
  for (const [text, message] of cases) assert.throws(() => parseConfig(text), message);
});

test('parseConfig: the web section overrides the defaults field by field', () => {
  const { web } = parseConfig('{"items":[{"url":"https://a.b","seconds":5}],"web":{"listen":"0.0.0.0","port":9000}}');
  assert.deepEqual(web, { ...DEFAULT_WEB, listen: '0.0.0.0', port: 9000 });
});

test('parseConfig: rejects a bad web section with the offending field', () => {
  const items = '"items":[{"url":"https://a.b","seconds":5}]';
  const cases = [
    ['"web":1', /"web" must be an object/],
    ['"web":{"listen":""}', /web\.listen/],
    ['"web":{"port":70000}', /web\.port/],
    ['"web":{"port":"80"}', /web\.port/],
    ['"web":{"user":""}', /web\.user/],
    ['"web":{"passwordHash":"plain"}', /web\.passwordHash/],
  ];
  for (const [web, message] of cases) assert.throws(() => parseConfig(`{${items},${web}}`), message);
});

test('replaceItems: swaps the list and keeps the rest of the file', () => {
  const text = replaceItems('{"items":[],"web":{"port":9000},"note":"x"}', [{ url: 'https://a.b', seconds: 5 }]);
  assert.deepEqual(JSON.parse(text), { items: [{ url: 'https://a.b', seconds: 5 }], web: { port: 9000 }, note: 'x' });
});
