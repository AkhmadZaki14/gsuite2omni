const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

/**
 * Resolves the path to OmniRoute's cliToken.mjs helper
 */
function findOmniRouteCliTokenHelper() {
  if (process.env.OMNIROUTE_CLI_HELPER && fs.existsSync(process.env.OMNIROUTE_CLI_HELPER)) {
    return process.env.OMNIROUTE_CLI_HELPER;
  }

  // 1. Coba lewat binary path `which omniroute`
  try {
    const binPath = execSync('which omniroute', { encoding: 'utf8' }).trim();
    if (binPath) {
      const realPath = fs.realpathSync(binPath);
      const candidate = path.join(path.dirname(realPath), 'cli', 'utils', 'cliToken.mjs');
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {}

  // 2. Cek lokasi instalasi global standar npm / nvm / pnpm / yarn
  const home = os.homedir();
  const candidates = [
    path.join(home, '.local/lib/node_modules/omniroute/bin/cli/utils/cliToken.mjs'),
    '/usr/local/lib/node_modules/omniroute/bin/cli/utils/cliToken.mjs',
    '/usr/lib/node_modules/omniroute/bin/cli/utils/cliToken.mjs',
    path.join(home, '.npm-global/lib/node_modules/omniroute/bin/cli/utils/cliToken.mjs')
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  return null;
}

/**
 * Mendapatkan CLI Token aktif untuk otentikasi request ke localhost:20128
 */
async function getOmniRouteCliToken() {
  if (process.env.OMNIROUTE_TOKEN) {
    return process.env.OMNIROUTE_TOKEN;
  }

  const helperPath = findOmniRouteCliTokenHelper();
  if (helperPath) {
    try {
      const { getCliToken } = await import(helperPath);
      const token = await getCliToken();
      if (token) return token;
    } catch (err) {
      console.warn(`[token] Gagal import cliToken helper dari ${helperPath}:`, err.message);
    }
  }

  throw new Error(
    'Tidak dapat menemukan OmniRoute CLI Token!\n' +
    'Pastikan OmniRoute sudah terinstall di komputer Anda (`npm i -g omniroute` atau jalankan `omniroute`).\n' +
    'Atau set environment variable `OMNIROUTE_TOKEN` secara manual.'
  );
}

module.exports = {
  getOmniRouteCliToken,
  findOmniRouteCliTokenHelper
};
