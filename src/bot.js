const { Camoufox } = require('camoufox-js');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { getOmniRouteCliToken } = require('./token');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROUTER_URL = process.env.OMNIROUTE_URL || 'http://localhost:20128';
const REDIRECT_URI = `${ROUTER_URL}/callback`;
const AKUN_FILE = path.resolve(__dirname, '../akun.txt');

// Window mini agar tidak mengganggu layar pengguna (480 x 650)
const WINDOW_WIDTH = 480;
const WINDOW_HEIGHT = 650;
const HEADLESS = process.env.HEADLESS === 'true'; // Default visible browser mode

// Tanya user jumlah batch / concurrency jika tidak dioper di argv
async function askConcurrency(defaultVal = 10) {
  if (!process.stdin.isTTY) return defaultVal;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`\n[?] Mau jalan berapa paralel per batch? (Rekomendasi: 10 atau 15) [default: ${defaultVal}]: `, (ans) => {
      rl.close();
      const val = ans.trim();
      if (!val) return resolve(defaultVal);
      const parsed = parseInt(val, 10);
      resolve(parsed > 0 ? parsed : defaultVal);
    });
  });
}

// Helper HTTP request ke OmniRoute API
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

async function exchangeToken(token, { code, codeVerifier, state }, retries = 4) {
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
      if (a < retries - 1) await sleep(1500 * (a + 1));
    }
  }
  throw lastErr;
}

// Fast DOM-Level Input (Zero Keystroke Lag)
async function fastInput(page, selector, value) {
  await page.waitForSelector(selector, { state: 'visible', timeout: 15000 });
  await page.click(selector, { timeout: 1500 }).catch(() => {});
  
  // Direct DOM dispatching — 0ms lag
  await page.evaluate(({ sel, val }) => {
    const el = document.querySelector(sel);
    if (el) {
      el.focus();
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, { sel: selector, val: value });

  // Fallback check
  const actual = await page.$eval(selector, el => el.value).catch(() => '');
  if (actual !== value) {
    await page.fill(selector, value);
  }
}

async function clickFirst(page, selectors) {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el && await el.isVisible()) {
        await el.click({ timeout: 1000 });
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

    // Abort media, fonts & trackers untuk performa kilat (Fast Load)
    await page.route('**/*', (route) => {
      const u = route.request().url();
      if (u.startsWith(REDIRECT_URI)) {
        try { authCode = new URL(u).searchParams.get('code'); } catch {}
        route.abort();
        return;
      }
      const type = route.request().resourceType();
      if (['image', 'font', 'media'].includes(type) || u.includes('google-analytics') || u.includes('doubleclick')) {
        route.abort();
        return;
      }
      route.continue();
    });

    await page.goto(authUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    if (authCode) return authCode;

    // 1. Ketik Email Kilat (Fast Input)
    await fastInput(page, '#identifierId', email);
    await sleep(250);

    const emailNext = await clickFirst(page, ['#identifierNext', '#identifierNext button', 'button:has-text("Next")', 'button:has-text("Berikutnya")']);
    if (!emailNext) await page.keyboard.press('Enter');

    // 2. Menunggu & Ketik Password Kilat
    for (let a = 0; a < 15; a++) {
      const u = page.url();
      if (!u.includes('/identifier') || u.includes('/challenge') || u.includes('/pwd')) break;
      if (await page.$('input[type="password"]')) break;
      await sleep(400);
    }

    let pwdSelector = null;
    for (const sel of ['input[type="password"][name="Passwd"]', 'input[type="password"]', '#password input', 'input[name="Passwd"]']) {
      try {
        const el = await page.waitForSelector(sel, { state: 'visible', timeout: 6000 });
        if (el) { pwdSelector = sel; break; }
      } catch {}
    }

    if (!pwdSelector) {
      const dbgPath = path.resolve(__dirname, `../debug-${email.split('@')[0]}.png`);
      await page.screenshot({ path: dbgPath, fullPage: true });
      throw new Error(`Password field tidak ditemukan, URL: ${page.url()}`);
    }

    await fastInput(page, pwdSelector, password);
    await sleep(250);

    const pwdNext = await clickFirst(page, ['#passwordNext', '#passwordNext button', 'button:has-text("Next")', 'button:has-text("Berikutnya")']);
    if (!pwdNext) await page.keyboard.press('Enter');

    // 3. Fast Auto-Bypass Security Speedbump & Consent ("Pastikan Anda mendownload aplikasi ini dari Google")
    const CONSENT = [
      '#accept', '#agree', '#submit_approve_access', '#tos-accept-button', 'button[type="submit"]',
      'button:has-text("Lanjutkan")', 'button:has-text("Continue")', 'button:has-text("Tetap login")',
      'button:has-text("Saya mengerti")', 'button:has-text("I understand")', 'button:has-text("Paham")',
      'button:has-text("Accept")', 'button:has-text("I accept")', 'button:has-text("Agree")', 'button:has-text("I agree")',
      'button:has-text("Setuju")', 'button:has-text("Saya setuju")', 'button:has-text("Terima")',
      'button:has-text("Next")', 'button:has-text("Berikutnya")',
      'button:has-text("Allow")', 'button:has-text("Izinkan")',
      'span:has-text("Lanjutkan")', 'span:has-text("Continue")', 'span:has-text("Saya mengerti")',
      'span:has-text("Accept")', 'span:has-text("Agree")', 'span:has-text("Setuju")',
      'div[role="button"]:has-text("Lanjutkan")', 'div[role="button"]:has-text("Continue")',
      'div[role="button"]:has-text("Saya mengerti")', 'div[role="button"]:has-text("Accept")',
      'div[role="button"]:has-text("Agree")', 'div[role="button"]:has-text("Setuju")',
      'div[role="button"]:has-text("Allow")', 'div[role="button"]:has-text("Izinkan")'
    ];

    const t0 = Date.now();
    while (!authCode && Date.now() - t0 < 50000) {
      if (page.url().startsWith(REDIRECT_URI)) {
        try { authCode = new URL(page.url()).searchParams.get('code'); } catch {}
        if (authCode) break;
      }

      // DOM Scan & Instant Click untuk Speedbump / Warning Google
      try {
        const clicked = await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
          const buttons = Array.from(document.querySelectorAll('button, div[role="button"], input[type="submit"], a[role="button"]'));
          for (const b of buttons) {
            const txt = (b.innerText || b.value || '').toLowerCase().trim();
            if (
              txt.includes('lanjutkan') || txt.includes('continue') ||
              txt.includes('mengerti') || txt.includes('paham') ||
              txt.includes('tetap') || txt.includes('allow') ||
              txt.includes('izinkan') || txt.includes('agree') ||
              txt.includes('setuju') || txt === 'next' ||
              txt === 'berikutnya'
            ) {
              b.click();
              return true;
            }
          }
          return false;
        });
        if (clicked) {
          await sleep(400);
          continue;
        }
      } catch {}

      await clickFirst(page, CONSENT);
      await sleep(350);
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

// MAIN EXECUTION
(async () => {
  const args = process.argv.slice(2);
  const isSingle = args.length >= 2 && args[0].includes('@');

  console.log(`\n======================================================`);
  console.log(`⚡ GSUITE2OMNI — AUTONOMOUS ACCOUNT PROVISIONER`);
  console.log(`   By Zaki — Ultra-Fast & Camoufox Anti-Detect`);
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

  // Tentukan concurrency: gunakan CLI arg jika ada, atau prompt interaktif (default: 10)
  let concurrency = args[0] ? parseInt(args[0], 10) : null;
  if (!concurrency || isNaN(concurrency)) {
    concurrency = await askConcurrency(10);
  }

  console.log(`\n[*] Mode: Bulk Provisioning`);
  console.log(`[*] Total antrean: ${accounts.length} akun`);
  console.log(`[*] Batch Size / Concurrency: ${concurrency} paralel`);
  console.log(`[*] Speed: Ultra-Fast DOM Input (Zero Keystroke Lag)`);
  console.log(`[*] Window: Mini (${WINDOW_WIDTH}x${WINDOW_HEIGHT})\n`);

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
        await sleep(bIdx * 800); // Stagger ringan agar exchange tidak tabrakan
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
              console.log(`  [!] Retry ${acc.email} (${attempt + 1}/3): ${e.message.slice(0, 80)}`);
              await sleep(1500);
            }
          }
        }

        failCount++;
        failedList.push(acc.email);
        console.error(`[✗] [${idx}/${accounts.length}] GAGAL: ${acc.email} (${lastErr?.message?.slice(0, 120)})`);
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
