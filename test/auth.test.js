'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword, checkBasicAuth } = require('../src/auth');
const { DEFAULT_WEB } = require('../src/config');

const basic = (user, password) => `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

test('hashPassword: verifies the same password only, salted', () => {
  const hash = hashPassword('s3cret');
  assert.ok(verifyPassword('s3cret', hash));
  assert.ok(!verifyPassword('s3cret ', hash));
  assert.notEqual(hashPassword('s3cret'), hash);
  assert.ok(!verifyPassword('s3cret', 'garbage'));
});

test('the default password is the one the README gives', () => {
  assert.ok(verifyPassword('kiosk-rotator', DEFAULT_WEB.passwordHash));
});

test('checkBasicAuth: needs both the user and the password', () => {
  const hash = hashPassword('pw:with:colons');
  assert.ok(checkBasicAuth(basic('admin', 'pw:with:colons'), 'admin', hash));
  assert.ok(!checkBasicAuth(basic('root', 'pw:with:colons'), 'admin', hash));
  assert.ok(!checkBasicAuth(basic('admin', 'nope'), 'admin', hash));
  assert.ok(!checkBasicAuth(undefined, 'admin', hash));
  assert.ok(!checkBasicAuth('Bearer x', 'admin', hash));
});
