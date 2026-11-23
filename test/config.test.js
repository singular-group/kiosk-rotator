'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_CONFIG, configPath, parseConfig } = require('../src/config');

test('configPath: flag, then environment, then default', () => {
  assert.equal(configPath(['x', '--config=/a.json'], {}), '/a.json');
  assert.equal(configPath(['x', '--config', '/b.json'], {}), '/b.json');
  assert.equal(configPath(['x'], { KIOSK_ROTATOR_CONFIG: '/c.json' }), '/c.json');
  assert.equal(configPath(['x'], {}), DEFAULT_CONFIG);
});

test('parseConfig: accepts a valid list', () => {
  const items = parseConfig('{"items":[{"url":"https://example.com/a?b=1","seconds":30}]}');
  assert.deepEqual(items, [{ url: 'https://example.com/a?b=1', seconds: 30 }]);
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
