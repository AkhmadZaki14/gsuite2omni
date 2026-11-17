#!/usr/bin/env node

const path = require('path');
const command = process.argv[2];

function printHelp() {
  console.log(`
⚡ gsuite2omni — Autonomous GSuite & Google Account Provisioner for OmniRoute
By Akhmad Zaki

Usage:
  gsuite2omni <command> [arguments]

Commands:
  add                     Provision akun dari akun.txt (default concurrency: 3)
  add <email> <password>  Provision 1 akun secara langsung
  status                  Tampilkan semua akun Antigravity yang terdaftar di OmniRoute
  delete <email|id>       Hapus koneksi akun dari OmniRoute
  help                    Tampilkan petunjuk ini

Examples:
  node src/bot.js 5
  node src/bot.js user@domain.com mypassword123
  node src/status.js
  node src/delete.js user@domain.com
`);
}

switch (command) {
  case 'add':
    process.argv.splice(2, 1);
    require('./src/bot.js');
    break;
  case 'status':
    require('./src/status.js');
    break;
  case 'delete':
    process.argv.splice(2, 1);
    require('./src/delete.js');
    break;
  case '-h':
  case '--help':
  case 'help':
    printHelp();
    break;
  default:
    if (command && command.includes('@')) {
      require('./src/bot.js');
    } else if (command && !isNaN(parseInt(command, 10))) {
      require('./src/bot.js');
    } else {
      printHelp();
    }
    break;
}
