'use strict';

const crypto = require('node:crypto');

// Stored as scrypt$<salt>$<hash>, both base64.
function hashPassword(password, salt = crypto.randomBytes(16)) {
  const hash = crypto.scryptSync(password, salt, 32);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(salt, 'base64'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

// HTTP Basic: true when the Authorization header carries this user and password.
function checkBasicAuth(header, user, passwordHash) {
  const match = /^Basic\s+(\S+)$/i.exec(header || '');
  if (!match) return false;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  if (sep < 0) return false;
  const userOk = decoded.slice(0, sep) === user;
  const passwordOk = verifyPassword(decoded.slice(sep + 1), passwordHash);
  return userOk && passwordOk;
}

module.exports = { hashPassword, verifyPassword, checkBasicAuth };
