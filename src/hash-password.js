'use strict';

// Prints the web.passwordHash for the password read from standard input:
//   printf %s 'new password' | node src/hash-password.js
const { hashPassword } = require('./auth');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  const password = input.replace(/\r?\n$/, '');
  if (!password) {
    console.error('hash-password: empty password on standard input');
    process.exit(1);
  }
  console.log(hashPassword(password));
});
