'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Rotation } = require('../src/rotation');

const items = [
  { url: 'https://a.example', seconds: 10 },
  { url: 'https://b.example', seconds: 5 },
];

test('each item stays for its own time, then wraps around', () => {
  const r = new Rotation(items, 0);
  assert.equal(r.tick(9999), false);
  assert.equal(r.tick(10000), true);
  assert.equal(r.index, 1);
  assert.equal(r.remainingMs(12000), 3000);
  assert.equal(r.tick(15000), true);
  assert.equal(r.index, 0);
});

test('pause freezes the remaining time', () => {
  const r = new Rotation(items, 0);
  r.togglePause(4000);
  assert.equal(r.tick(60000), false);
  assert.equal(r.remainingMs(60000), 6000);
  r.togglePause(60000);
  assert.equal(r.remainingMs(61000), 5000);
  assert.equal(r.tick(66000), true);
});

test('next and previous restart the timer and wrap', () => {
  const r = new Rotation(items, 0);
  r.go(-1, 3000);
  assert.equal(r.index, 1);
  assert.equal(r.remainingMs(3000), 5000);
  r.go(1, 4000);
  assert.equal(r.index, 0);
});
