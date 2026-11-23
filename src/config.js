'use strict';

const os = require('node:os');
const path = require('node:path');

const DEFAULT_CONFIG = path.join(os.homedir(), '.config', 'kiosk-rotator', 'config.json');

// --config=<file> or --config <file>, then $KIOSK_ROTATOR_CONFIG, then the default.
function configPath(argv, env) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--config=')) return argv[i].slice('--config='.length);
    if (argv[i] === '--config' && argv[i + 1]) return argv[i + 1];
  }
  return env.KIOSK_ROTATOR_CONFIG || DEFAULT_CONFIG;
}

// The config web page, unless the file's "web" section says otherwise. The
// default password is "kiosk-rotator" (see the README).
const DEFAULT_WEB = {
  listen: '127.0.0.1',
  port: 8080,
  user: 'admin',
  passwordHash: 'scrypt$gvRckiea8GPhaaMT7eQWnA==$VdafwAUYHkOywz1PXGNJnoFbTFV0k7wzfs34vMIC0uo=',
};

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`not valid JSON: ${err.message}`);
  }
}

function parseItems(list) {
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('"items" must be a non-empty list');
  }
  return list.map((item, i) => {
    const where = `items[${i}]`;
    if (!item || typeof item !== 'object') throw new Error(`${where} must be an object`);
    let url;
    try {
      url = new URL(item.url);
    } catch {
      throw new Error(`${where}.url is not a valid URL`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`${where}.url must be http or https`);
    }
    if (typeof item.seconds !== 'number' || !Number.isFinite(item.seconds) || item.seconds < 1) {
      throw new Error(`${where}.seconds must be a number >= 1`);
    }
    return { url: item.url, seconds: item.seconds };
  });
}

function parseWeb(section) {
  if (section === undefined) return { ...DEFAULT_WEB };
  if (!section || typeof section !== 'object') throw new Error('"web" must be an object');
  const web = { ...DEFAULT_WEB, ...section };
  if (typeof web.listen !== 'string' || !web.listen) throw new Error('web.listen must be an address');
  if (!Number.isInteger(web.port) || web.port < 1 || web.port > 65535) {
    throw new Error('web.port must be a port number');
  }
  if (typeof web.user !== 'string' || !web.user) throw new Error('web.user must be a non-empty string');
  if (typeof web.passwordHash !== 'string' || !web.passwordHash.startsWith('scrypt$')) {
    throw new Error('web.passwordHash must be a hash from hash-password.js');
  }
  return { listen: web.listen, port: web.port, user: web.user, passwordHash: web.passwordHash };
}

function parseConfig(text) {
  const data = parseJson(text);
  if (!data || typeof data !== 'object') throw new Error('"items" must be a non-empty list');
  return { items: parseItems(data.items), web: parseWeb(data.web) };
}

// The file's text with its items replaced, everything else in it kept.
function replaceItems(text, items) {
  return `${JSON.stringify({ ...parseJson(text), items }, null, 2)}\n`;
}

module.exports = { DEFAULT_CONFIG, DEFAULT_WEB, configPath, parseItems, parseConfig, replaceItems };
