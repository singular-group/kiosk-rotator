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

function parseConfig(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`not valid JSON: ${err.message}`);
  }
  if (!data || !Array.isArray(data.items) || data.items.length === 0) {
    throw new Error('"items" must be a non-empty list');
  }
  return data.items.map((item, i) => {
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

module.exports = { DEFAULT_CONFIG, configPath, parseConfig };
