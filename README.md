# ⚡ gsuite2omni — by Zaki

Autonomous bulk provisioner untuk menghubungkan akun **Google Workspace (GSuite)** ke **OmniRoute AI Router** secara otomatis menggunakan browser anti-detect Camoufox.

---

## 🧩 Cara Kerja

> GSuite Accounts → Google OAuth (Camoufox Anti-Detect) → OmniRoute Token Exchange → Akun Aktif sebagai AI Provider

Setiap akun yang ditambahkan menjadi **Antigravity connection** di OmniRoute — artinya bisa dipakai sebagai provider model AI (`claude-sonnet`, `gemini-flash`, `gpt-4o`, dll) dengan **kuota rotating otomatis**.

---

## 📋 Prasyarat

| Prasyarat | Keterangan |
|-----------|------------|
| **Node.js** v18+ | [Download](https://nodejs.org) |
| **OmniRoute** (running) | Install via `npm i -g omniroute` lalu jalankan `omniroute` atau `omniroute serve` |
| **MacOS / Linux** | Windows belum didukung penuh (Camoufox & machine-id) |

---

## 🚀 Instalasi

### 1. Clone repo

```bash
git clone https://github.com/AkhmadZaki14/gsuite2omni.git
cd gsuite2omni
```

### 2. Install dependencies

```bash
npm install
```

### 3. Download Camoufox browser (first time only, ~700MB cached)

```bash
npx camoufox fetch
```

### 4. Pastikan OmniRoute berjalan

```bash
omniroute
# atau: omniroute serve
```

Cek status:
```bash
curl http://localhost:20128/api/health
# Response: {"status":"ok","timestamp":"..."}
```

---

## 📖 Cara Pakai

### ➡️ Mode 1: Provisioning 1 akun langsung (testing)

```bash
node src/bot.js email@domain.com password123
```

### ➡️ Mode 2: Bulk provisioning dari file `akun.txt`

1. Buat file `akun.txt` di folder repo:

   ```txt
   user1@domain.com|password1
   user2@domain.com|password2
   user3@domain.com|password3
   ```

   > Format: `email|password` atau `email:password` per baris. Akun yang berhasil otomatis dihapus dari file.

2. Jalankan (default: 3 paralel):

   ```bash
   npm run add
   # atau custom concurrency (misal 5 paralel):
   node src/bot.js 5
   ```

### ➡️ Cek status akun di OmniRoute

```bash
npm run status
# atau
node src/status.js
```

Output contoh:
```
Total Antigravity Accounts : 12

+------------------------------------------+----------+----------------------+
| Email / Nama Akun                        | Status   | ID Koneksi           |
+------------------------------------------+----------+----------------------+
| user1@domain.com                         | Active   | abc123...            |
| user2@domain.com                         | Active   | def456...            |
...
```

### ➡️ Hapus akun dari OmniRoute

```bash
npm run delete -- user1@domain.com
# atau pake connection ID
node src/delete.js abc123-connection-id
```

---

## ⚙️ Environment Variables (Opsional)

| Variable | Default | Keterangan |
|----------|---------|------------|
| `OMNIROUTE_URL` | `http://localhost:20128` | URL OmniRoute server |
| `OMNIROUTE_TOKEN` | *(auto-detect)* | Override CLI token manual |
| `OMNIROUTE_CLI_HELPER` | *(auto-detect)* | Path ke `cliToken.mjs` jika gagal auto-detect |
| `HEADLESS` | `false` | Jalankan browser headless: `HEADLESS=true npm run add` |

---

## 🔍 Troubleshooting

### OmniRoute token tidak ditemukan
Pastikan OmniRoute sudah terinstall:
```bash
npm i -g omniroute
omniroute
```

Atau set manual:
```bash
OMNIROUTE_TOKEN=<token-kamu> node src/bot.js user@domain.com password123
```

### Google menolak login / CAPTCHA

- Gunakan IP residensial (hindari VPN datacenter / proxy terkenal).
- Coba turunkan concurrency ke 1: `node src/bot.js 1`
- Tunggu 24-48 jam jika IP kena rate limit Google.

### Screenshot debug

Jika gagal, file `debug-*.png` dan `fail-*.png` muncul di folder repo — buka untuk melihat kondisi terakhir halaman browser waktu error.

---

## 📁 Struktur Project

```
gsuite2omni/
├── src/
│   ├── bot.js        # Core provisioning engine (Camoufox + OAuth)
│   ├── status.js     # Tampilkan akun terdaftar di OmniRoute
│   ├── delete.js     # Hapus akun dari OmniRoute
│   └── token.js      # Auto-detect OmniRoute CLI Token (x-omniroute-cli-token)
├── akun.example.txt  # Contoh format file akun
├── index.js          # Entry point CLI
├── package.json
├── .gitignore
└── README.md
```

---

## 🛡️ Security Notes

- File `akun.txt` ada di `.gitignore` — **tidak pernah ikut commit**.
- OmniRoute token di-derive dari hardware machine ID (SHA256 HMAC), hanya valid di komputer yang sama.
- Token Google OAuth di-encrypt oleh OmniRoute menggunakan `STORAGE_ENCRYPTION_KEY` sebelum disimpan ke SQLite.

---

## 🤝 Author

Built by **Akhmad Zaki** — [@AkhmadZaki14](https://github.com/AkhmadZaki14)

---

## 📄 License

MIT
