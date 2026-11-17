# ⚡ gsuite2omni — by Zaki

Autonomous, Ultra-Fast bulk account provisioner untuk menghubungkan puluhan hingga ratusan akun **Google Workspace (GSuite)** ke **OmniRoute AI Router** secara otomatis menggunakan browser anti-detect Camoufox.

---

## 🚀 Fitur Unggulan

- ⚡ **Ultra-Fast DOM Input (Zero Keystroke Lag)**: Mengetik email & password dalam 0 milidetik via direct event dispatching.
- 🪟 **Mini Window Mode (480 x 650)**: Jendela browser terbuka kecil dan rapi di pojok layar, tidak fullscreen dan tidak mengganggu aktivitas Anda.
- 🛡️ **Bypass Google Security Speedbump**: Otomatis mendeteksi dan mengklik *"Pastikan Anda mendownload aplikasi ini dari Google"*, *"Tetap login"*, *"Lanjutkan"*, *"Saya mengerti"*, dan halaman consent OAuth lainnya.
- 🔄 **Interactive Batch Concurrency (10 / 15)**: Otomatis menanyakan jumlah paralel saat dijalankan (default rekomendasi: 10 atau 15 paralel).
- 🔐 **Native OmniRoute Integration**: Menggunakan otentikasi hardware-derived `x-omniroute-cli-token` langsung ke server lokal (tanpa perlu repot konfigurasi password / API key).
- 🧹 **Auto-Cleanup**: Akun yang berhasil di-provisioning otomatis terhapus dari `akun.txt`.

---

## 🧩 Cara Kerja

```
GSuite Accounts (akun.txt)
        │
        ▼
Camoufox Anti-Detect Browser (Mini Window)
        │
        ▼
Fast DOM Input (Email & Password)
        │
        ▼
Auto-Bypass Google Speedbump / Consent
        │
        ▼
Capture OAuth Authorization Code
        │
        ▼
OmniRoute Token Exchange (/api/oauth/antigravity/exchange)
        │
        ▼
Aktif di Pool Kuota Rotating OmniRoute (Antigravity Models)
```

Setiap akun yang masuk otomatis menjadi penyedia model AI (`claude-sonnet-4-6`, `claude-opus-4-6-thinking`, `gemini-3.8-flash-high`, dll) dengan kuota rotasi otomatis tanpa batas rate limit.

---

## 📋 Prasyarat

| Komponen | Versi Minimal | Keterangan |
| :--- | :--- | :--- |
| **Node.js** | `>= 18.0.0` | Runtime JavaScript |
| **OmniRoute** | `>= 3.8.50` | AI Router aktif di port `20128` |
| **OS** | macOS / Linux | Platform dengan dukungan Camoufox |

---

## 📦 Panduan Instalasi Lengkap

### 1. Clone Repositori

```bash
git clone https://github.com/AkhmadZaki14/gsuite2omni.git
cd gsuite2omni
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Unduh Browser Camoufox (Cukup sekali saat awal)

```bash
npx camoufox fetch
```

### 4. Pastikan OmniRoute Sedang Berjalan

Pastikan server OmniRoute lokal Anda aktif:
```bash
omniroute
# atau: omniroute serve
```

Verifikasi status kesehatan server:
```bash
curl http://localhost:20128/api/health
# Response: {"status":"ok","timestamp":"..."}
```

---

## 🎯 Panduan Penggunaan

### 1️⃣ Mode Bulk Provisioning (Banyak Akun)

1. Siapkan file `akun.txt` di root folder:
   ```text
   user1@domain.com|password123
   user2@domain.com|password123
   user3@domain.com:password123
   ```
   *(Pemisah bisa menggunakan tanda pipa `|` atau titik dua `:`)*.

2. Jalankan bot:
   ```bash
   npm run add
   ```
   Bot akan menanyakan jumlah paralel yang diinginkan:
   ```text
   [?] Mau jalan berapa paralel per batch? (Rekomendasi: 10 atau 15) [default: 10]:
   ```
   Tekan **Enter** untuk langsung memilih 10 akun paralel, atau ketik `15`.

3. Atau bypass prompt dengan menentukan angka langsung di terminal:
   ```bash
   node src/bot.js 10
   # atau untuk 15 paralel:
   node src/bot.js 15
   ```

---

### 2️⃣ Mode Single Account (Tes 1 Akun)

Jika ingin mengetes 1 akun saja secara langsung tanpa membuat file `akun.txt`:

```bash
node src/bot.js email@domain.com password123
```

---

### 3️⃣ Cek Status & Daftar Akun Terhubung

Untuk melihat semua akun GSuite / Antigravity yang sudah aktif di OmniRoute beserta statistik domain:

```bash
npm run status
```

Output:
```text
======================================================
🔍 GSUITE2OMNI — STATUS KONEKSI AKUN DI OMNIROUTE
======================================================

Router URL : http://localhost:20128
Total Antigravity Accounts : 15

+------------------------------------------+----------+----------------------+
| Email / Nama Akun                        | Status   | ID Koneksi           |
+------------------------------------------+----------+----------------------+
| user1@paragadis.com                      | Active   | fea79c8a-4dcc-4048-b... |
| user2@satukataku.com                     | Active   | 01249061-0dac-432d-9... |
+------------------------------------------+----------+----------------------+

Statistik per Domain:
  - @paragadis.com: 10 akun
  - @satukataku.com: 5 akun
```

---

### 4️⃣ Hapus Akun dari OmniRoute

Jika kuota sebuah akun sudah habis atau ingin dibersihkan:

```bash
# Menggunakan alamat email
npm run delete -- user1@domain.com

# Atau menggunakan Connection ID
node src/delete.js 01249061-0dac-432d-963f-70b80b2b2bbf
```

---

## 🛠️ Konfigurasi Lanjutan (Environment Variables)

| Variable | Default | Fungsi |
| :--- | :--- | :--- |
| `OMNIROUTE_URL` | `http://localhost:20128` | Alamat base URL OmniRoute |
| `OMNIROUTE_TOKEN` | *(Auto-detect)* | Override token CLI OmniRoute manual |
| `HEADLESS` | `false` | Set `HEADLESS=true` jika ingin mode tanpa GUI window |

---

## 💡 Tips & Troubleshooting

1. **Google Reject / Captcha**:
   - Gunakan koneksi internet residensial (Wi-Fi rumah / hotspot seluler). Jangan gunakan VPN datacenter gratisan.
   - Jika satu domain mengalami rate-limit dari Google, beri jeda beberapa jam atau turunkan concurrency ke `3` atau `5`.

2. **Debug Screenshot**:
   - Jika ada akun yang gagal, bot akan otomatis mengambil screenshot layar terakhir dan menyimpannya sebagai `debug-<email>.png` atau `fail-<email>.png` untuk memudahkan investigasi.

---

## 📁 Struktur Repositori

```
gsuite2omni/
├── src/
│   ├── bot.js         # Core Engine: Fast input, Speedbump bypass, Camoufox
│   ├── status.js      # Status checker & domain breakdown
│   ├── delete.js      # Clean up & revoke connection
│   └── token.js       # Auto-detect OmniRoute CLI Token
├── akun.example.txt   # Template format akun
├── index.js           # CLI entry point
├── package.json
├── .gitignore
├── LICENSE            # MIT License
└── README.md
```

---

## 👤 Author

Dikembangkan oleh **Akhmad Zaki**  
GitHub: [@AkhmadZaki14](https://github.com/AkhmadZaki14)

---

## 📜 Lisensi

Didistribusikan di bawah lisensi MIT. Bebas digunakan, dimodifikasi, dan dibagikan.
