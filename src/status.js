const { getOmniRouteCliToken } = require('./token');

const ROUTER_URL = process.env.OMNIROUTE_URL || 'http://localhost:20128';

(async () => {
  console.log(`\n======================================================`);
  console.log(`🔍 GSUITE2OMNI — STATUS KONEKSI AKUN DI OMNIROUTE`);
  console.log(`======================================================\n`);

  let token;
  try {
    token = await getOmniRouteCliToken();
  } catch (err) {
    console.error(`[ERROR] ${err.message}\n`);
    process.exit(1);
  }

  try {
    const res = await fetch(`${ROUTER_URL}/api/providers`, {
      headers: {
        'Content-Type': 'application/json',
        'x-omniroute-cli-token': token
      }
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    let connections = data.connections || data;
    if (!Array.isArray(connections) && typeof connections === 'object') {
      connections = Object.values(connections);
    }

    const antigravityAccounts = (connections || []).filter(c => c.provider === 'antigravity');

    console.log(`Router URL : ${ROUTER_URL}`);
    console.log(`Total Antigravity Accounts : ${antigravityAccounts.length}\n`);

    if (antigravityAccounts.length === 0) {
      console.log(`[!] Belum ada akun Antigravity yang terhubung di OmniRoute.`);
      console.log(`    Jalankan 'npm run add' untuk menambahkan akun.\n`);
      return;
    }

    console.log(`+------------------------------------------+----------+----------------------+`);
    console.log(`| Email / Nama Akun                        | Status   | ID Koneksi           |`);
    console.log(`+------------------------------------------+----------+----------------------+`);

    const domainCounts = {};
    for (const acc of antigravityAccounts) {
      const email = (acc.email || acc.name || 'N/A').padEnd(40).slice(0, 40);
      const status = (acc.isActive ? 'Active' : 'Disabled').padEnd(8);
      const id = (acc.id || 'N/A').slice(0, 20);
      console.log(`| ${email} | ${status} | ${id}... |`);

      const fullEmail = acc.email || acc.name || '';
      if (fullEmail.includes('@')) {
        const domain = fullEmail.split('@')[1];
        domainCounts[domain] = (domainCounts[domain] || 0) + 1;
      }
    }
    console.log(`+------------------------------------------+----------+----------------------+\n`);

    console.log(`Statistik per Domain:`);
    for (const [dom, count] of Object.entries(domainCounts)) {
      console.log(`  - @${dom}: ${count} akun`);
    }
    console.log(``);

  } catch (err) {
    console.error(`[ERROR] Gagal mengambil status dari OmniRoute:`, err.message);
  }
})();
