const { getOmniRouteCliToken } = require('./token');

const ROUTER_URL = process.env.OMNIROUTE_URL || 'http://localhost:20128';

(async () => {
  const target = process.argv[2];

  console.log(`\n======================================================`);
  console.log(`🗑️  GSUITE2OMNI — HAPUS KONEKSI AKUN DARI OMNIROUTE`);
  console.log(`======================================================\n`);

  if (!target) {
    console.log(`Usage: node src/delete.js <email-atau-connection-id>`);
    console.log(`Contoh:`);
    console.log(`  node src/delete.js user1@doxhy.com`);
    console.log(`  node src/delete.js 01249061-0dac-432d-963f-70b80b2b2bbf\n`);
    process.exit(0);
  }

  let token;
  try {
    token = await getOmniRouteCliToken();
  } catch (err) {
    console.error(`[ERROR] ${err.message}\n`);
    process.exit(1);
  }

  try {
    // 1. Cari connection id
    const res = await fetch(`${ROUTER_URL}/api/providers`, {
      headers: {
        'Content-Type': 'application/json',
        'x-omniroute-cli-token': token
      }
    });

    const data = await res.json();
    let connections = data.connections || data;
    if (!Array.isArray(connections) && typeof connections === 'object') {
      connections = Object.values(connections);
    }

    const matched = (connections || []).filter(c =>
      c.id === target ||
      (c.email && c.email.toLowerCase() === target.toLowerCase()) ||
      (c.name && c.name.toLowerCase() === target.toLowerCase())
    );

    if (matched.length === 0) {
      console.log(`[!] Akun / Connection ID '${target}' tidak ditemukan di OmniRoute.`);
      return;
    }

    for (const conn of matched) {
      process.stdout.write(`[*] Menghapus ${conn.email || conn.name} (ID: ${conn.id})... `);
      const delRes = await fetch(`${ROUTER_URL}/api/providers/${encodeURIComponent(conn.id)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-omniroute-cli-token': token
        }
      });

      if (delRes.ok) {
        console.log(`[TERHAPUS]`);
      } else {
        console.log(`[GAGAL: HTTP ${delRes.status}]`);
      }
    }

    console.log(`\n🎉 Operasi penghapusan selesai!\n`);
  } catch (err) {
    console.error(`[ERROR] Gagal menghapus koneksi:`, err.message);
  }
})();
