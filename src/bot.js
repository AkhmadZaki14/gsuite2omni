const { Camoufox } = require('camoufox-js');
const fs = require('fs');
const path = require('path');
const { getOmniRouteCliToken } = require('./token');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROUTER_URL = process.env.OMNIROUTE_URL || 'http://localhost:20128';
const REDIRECT_URI = `${ROUTER_URL}/callback`;
const AKUN_FILE = path.resolve(__dirname, '../akun.txt');

// Window mini agar tidak mengganggu layar pengguna (480 x 650)
const WINDOW_WIDTH = 480;
const WINDOW_HEIGHT = 650;
const HEADLESS = process.env.HEADLESS === 'true'; // Default visible browser mode

// Helper fungsi HTTP request ke OmniRoute API
async function apiRequest(endpoint, { method = 'GET', body, token, timeout = 30000 } = {}) {
  const url = `${ROUTER_URL}${endpoint}`;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-omniroute-cli-token': token
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(id);
  }
}

async function startOAuth(token) {
  const res = await apiRequest(`/api/oauth/antigravity/authorize?redirect_uri=${encodeURIComponent(REDIRECT_URI)}`, {
    token,
    timeout: 20000
  });
  if (!res.ok) {
    throw new Error(`Start OAuth gagal (${res.status}): ${JSON.stringify(res.data)}`);
  }
  const { authUrl, codeVerifier, state } = res.data;
  if (!authUrl || !codeVerifier || !state) {
    throw new Error('Response OAuth OmniRoute tidak lengkap');
  }
  return { authUrl, codeVerifier, state };
}

async function exchangeToken(token, { code, codeVerifier, state }, retries = 3) {
  let lastErr = null;
  for (let a = 0; a < retries; a++) {
    try {
      const res = await apiRequest(`/api/oauth/antigravity/exchange`, {
        method: 'POST',
        token,
        body: { code, redirectUri: REDIRECT_URI, codeVerifier, state },
        timeout: 45000
      });
      if (!res.ok) {
        throw new Error(`Exchange gagal (${res.status}): ${JSON.stringify(res.data)}`);
      }
      return res.data;
    } catch (e) {
      lastErr = e;
      if (a < retries - 1) await sleep(2000);
    }
  }
  throw lastErr;
}

async function clickFirst(page, selectors) {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el && await el.isVisible()) {
        await el.click({ timeout: 1200 });
        return true;
      }
    } catch {}
  }
  return false;
}

async function googleLogin(browser, authUrl, email, password) {
  const context = await browser.newContext({
    viewport: { width: WINDOW_WIDTH, height: WINDOW_HEIGHT }
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.chrome = { runtime: {} };
  });

  const page = await context.newPage();
  try {
    let authCode = null;
    await page.route('**/*', (route) => {
      const u = route.request().url();
      if (u.startsWith(REDIRECT_URI)) {
        try { authCode = new URL(u).searchParams.get('code'); } catch {}
        route.abort();
        return;
      }
      if (['image', 'font', 'media'].includes(route.request().resourceType())) {
        route.abort();
        return;
      }
      route.continue();
    });

    await page.goto(authUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (authCode) return authCode;

    // 1. Ketik Email
    await page.waitForSelector('#identifierId', { state: 'visible', timeout: 20000 });
    await sleep(500);
    await page.click('#identifierId');
    await sleep(200);
    await page.fill('#identifierId', email);

    let val = await page.$eval('#identifierId', el => el.value).catch(() => '');
    if (val !== email) {
      await page.focus('#identifierId');
      await page.keyboard.press('Meta+A');
      await page.keyboard.press('Backspace');
      await page.type('#identifierId', email, { delay: 35 });
    }
    await sleep(800);

    const emailNext = await clickFirst(page, ['#identifierNext', '#identifierNext button', 'button:has-text("Next")', 'button:has-text("Berikutnya")']);
    if (!emailNext) await page.keyboard.press('Enter');
    await sleep(2500);

    // 2. Menunggu & Ketik Password
    for (let a = 0; a < 15; a++) {
      const u = page.url();
      if (!u.includes('/identifier') || u.includes('/challenge') || u.includes('/pwd')) break;
      if (await page.$('input[type="password"]')) break;
      await sleep(1000);
    }

    let pwdField = null;
    for (const sel of ['input[type="password"][name="Passwd"]', 'input[type="password"]', '#password input', 'input[name="Passwd"]', 'div[role="form"] input[type="password"]']) {
      try { pwdField = await page.waitForSelector(sel, { state: 'visible', timeout: 8000 }); if (pwdField) break; }
      catch {}
    }
    if (!pwdField) {
      const dbgPath = path.resolve(__dirname, `../debug-${email.split('@')[0]}.png`);
      await page.screenshot({ path: dbgPath, fullPage: true });
      throw new Error(`Password field tidak ditemukan, screenshot disimpan ke ${dbgPath}`);
    }

    await sleep(500);
    await pwdField.click();
    await sleep(200);
    await pwdField.fill(password);
    await sleep(800);

    const pwdNext = await clickFirst(page, ['#passwordNext', '#passwordNext button', 'button:has-text("Next")', 'button:has-text("Berikutnya")']);
    if (!pwdNext) await page.keyboard.press('Enter');

    // 3. Menunggu Persetujuan & Bypass Speedbump ("Pastikan Anda mendownload aplikasi ini dari Google")
    const CONSENT = [
      '#accept', '#agree', '#submit_approve_access', '#tos-accept-button', 'button[type="submit"]',
      'button:has-text("Lanjutkan")', 'button:has-text("Continue")', 'button:has-text("Tetap login")',
      'button:has-text("Saya mengerti")', 'button:has-text("I understand")', 'button:has-text("Paham")',
      'button:has-text("Accept")', 'button:has-text("I accept")', 'button:has-text("Agree")', 'button:has-text("I agree")',
      'button:has-text("Setuju")', 'button:has-text("Saya setuju")', 'button:has-text("Terima")',
      'button:has-text("Next")', 'button:has-text("Berikutnya")',
      'button:has-text("Allow")', 'button:has-text("Izinkan")',
      'span:has-text("Lanjutkan")', 'span:has-text("Continue")', 'span:has-text("Saya mengerti")',
      'span:has-text("Accept")', 'span:has-text("Agree")', 'span:has-text("Setuju")', 'span:has-text("Lanjut")',
      'span:has-text("Allow")', 'span:has-text("Izinkan")',
      'div[role="button"]:has-text("Lanjutkan")', 'div[role="button"]:has-text("Continue")',
      'div[role="button"]:has-text("Saya mengerti")', 'div[role="button"]:has-text("Accept")',
      'div[role="button"]:has-text("Agree")', 'div[role="button"]:has-text("Setuju")',
      'div[role="button"]:has-text("Allow")', 'div[role="button"]:has-text("Izinkan")'
    ];

    const t0 = Date.now();
    while (!authCode && Date.now() - t0 < 60000) {
      if (page.url().startsWith(REDIRECT_URI)) {
        try { authCode = new URL(page.url()).searchParams.get('code'); } catch {}
        if (authCode) break;
      }

      // Handle DOM speedbump & Google security warning modal
      try {
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
          const buttons = Array.from(document.querySelectorAll('button, div[role="button"], input[type="submit"], a[role="button"]'));
          for (const b of buttons) {
            const txt = (b.innerText || b.value || '').toLowerCase();
            if (
              txt.includes('lanjutkan') || txt.includes('continue') ||
              txt.includes('mengerti') || txt.includes('paham') ||
              txt.includes('tetap') || txt.includes('allow') ||
              txt.includes('izinkan') || txt.includes('agree') ||
              txt.includes('setuju') || txt.includes('next') ||
              txt.includes('berikutnya')
            ) {
              b.click();
              break;
            }
          }
        });
      } catch {}

      await clickFirst(page, CONSENT);
      await sleep(1000);
    }

    if (!authCode) {
      try { if (page.url().startsWith(REDIRECT_URI)) authCode = new URL(page.url()).searchParams.get('code'); } catch {}
    }
    if (!authCode) {
      const failPath = path.resolve(__dirname, `../fail-${email.split('@')[0]}.png`);
      await page.screenshot({ path: failPath, fullPage: true });
      throw new Error(`Auth code tidak ter-capture (timeout), URL: ${page.url()}`);
    }
    return authCode;
  } finally {
    await context.close();
  }
}

function readAccountsFile() {
  if (!fs.existsSync(AKUN_FILE)) return [];
  const content = fs.readFileSync(AKUN_FILE, 'utf-8').trim();
  if (!content) return [];
  return content.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'))
    .map(line => {
      const sep = line.includes('|') ? '|' : (line.includes(':') ? ':' : null);
      if (!sep) return null;
      const parts = line.split(sep);
      return { email: parts[0].trim(), password: parts[1].trim(), raw: line };
    })
    .filter(a => a && a.email && a.password);
}

function removeAccountFromFile(rawLine) {
  if (!fs.existsSync(AKUN_FILE)) return;
  const content = fs.readFileSync(AKUN_FILE, 'utf-8');
  const filtered = content.split('\n').filter(l => l.trim() !== rawLine.trim()).join('\n');
  fs.writeFileSync(AKUN_FILE, filtered);
}

// MAIN FUNCTION
(async () => {
  const args = process.argv.slice(2);
  const isSingle = args.length >= 2 && args[0].includes('@');

  console.log(`\n======================================================`);
  console.log(`⚡ GSUITE2OMNI — AUTONOMOUS ACCOUNT PROVISIONER`);
  console.log(`   By Zaki — Powered by Camoufox Anti-Detect`);
  console.log(`======================================================\n`);

  // 1. Ambil CLI Token OmniRoute
  process.stdout.write(`[*] Mengambil token autentikasi OmniRoute... `);
  let cliToken;
  try {
    cliToken = await getOmniRouteCliToken();
    console.log(`[OK]`);
  } catch (err) {
    console.log(`[FAILED]`);
    console.error(`\n[ERROR] ${err.message}\n`);
    process.exit(1);
  }

  // MODE A: SINGLE ACCOUNT
  if (isSingle) {
    const [email, password] = args;
    console.log(`[*] Mode: Single Account`);
    console.log(`[*] Target: ${email}`);

    const browser = await Camoufox({
      headless: HEADLESS,
      viewport: { width: WINDOW_WIDTH, height: WINDOW_HEIGHT },
      args: [`--width=${WINDOW_WIDTH}`, `--height=${WINDOW_HEIGHT}`]
    });

    try {
      console.log(`[*] Meminta auth URL dari OmniRoute...`);
      const { authUrl, codeVerifier, state } = await startOAuth(cliToken);
      console.log(`[*] Menjalankan browser otomatis...`);
      const code = await googleLogin(browser, authUrl, email, password);
      console.log(`[✓] Google OAuth code berhasil ditangkap!`);

      process.stdout.write(`[*] Mengirim token exchange ke OmniRoute... `);
      const res = await exchangeToken(cliToken, { code, codeVerifier, state });
      console.log(`[OK]`);

      console.log(`\n🎉 SUKSES! Akun ${email} berhasil terhubung ke OmniRoute!`);
      if (res.connection?.id) console.log(`   Connection ID: ${res.connection.id}`);
    } catch (err) {
      console.error(`\n[✗] GAGAL: ${err.message}`);
    } finally {
      await browser.close().catch(() => {});
    }
    return;
  }

  // MODE B: BULK ACCOUNT DARI akun.txt
  const accounts = readAccountsFile();
  if (accounts.length === 0) {
    console.log(`[!] Tidak ada akun yang ditemukan di ${AKUN_FILE}`);
    console.log(`    Silakan buat file akun.txt dengan format: email|password (satu per baris)`);
    console.log(`    Atau jalankan single account: node src/bot.js email@domain.com password123\n`);
    process.exit(0);
  }

  const concurrency = parseInt(args[0] || '3', 10) || 3;
  console.log(`[*] Mode: Bulk Provisioning`);
  console.log(`[*] Total antrean: ${accounts.length} akun`);
  console.log(`[*] Concurrency: ${concurrency} paralel\n`);

  let successCount = 0;
  let failCount = 0;
  const failedList = [];
  const t0 = Date.now();

  for (let i = 0; i < accounts.length; i += concurrency) {
    const batch = accounts.slice(i, i + concurrency);
    const browser = await Camoufox({
      headless: HEADLESS,
      viewport: { width: WINDOW_WIDTH, height: WINDOW_HEIGHT },
      args: [`--width=${WINDOW_WIDTH}`, `--height=${WINDOW_HEIGHT}`]
    });

    try {
      await Promise.all(batch.map(async (acc, bIdx) => {
        await sleep(bIdx * 1500); // stagger agar tidak request serentak
        const idx = i + bIdx + 1;
        console.log(`[${idx}/${accounts.length}] Memproses ${acc.email}...`);

        let lastErr = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const { authUrl, codeVerifier, state } = await startOAuth(cliToken);
            const code = await googleLogin(browser, authUrl, acc.email, acc.password);
            await exchangeToken(cliToken, { code, codeVerifier, state });
            successCount++;
            console.log(`[✓] [${idx}/${accounts.length}] SUKSES: ${acc.email}`);
            removeAccountFromFile(acc.raw);
            return;
          } catch (e) {
            lastErr = e;
            if (attempt < 3) {
              console.log(`  [!] Retry ${acc.email} (Percobaan ${attempt + 1}/3): ${e.message.slice(0, 100)}`);
              await sleep(2000);
            }
          }
        }

        failCount++;
        failedList.push(acc.email);
        console.error(`[✗] [${idx}/${accounts.length}] GAGAL: ${acc.email} (${lastErr?.message?.slice(0, 150)})`);
      }));
    } finally {
      await browser.close().catch(() => {});
    }

    console.log(`\n--- Progress: Sukses ${successCount} | Gagal ${failCount} | Total Sisa: ${accounts.length - (i + batch.length)} ---\n`);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`======================================================`);
  console.log(`🏁 SELESAI dalam ${elapsed} detik`);
  console.log(`   Sukses: ${successCount} akun`);
  console.log(`   Gagal : ${failCount} akun`);
  console.log(`======================================================\n`);
  if (failedList.length > 0) {
    console.log(`Daftar Akun Gagal:\n${failedList.join('\n')}\n`);
  }
})();
