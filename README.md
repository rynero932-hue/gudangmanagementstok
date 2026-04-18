# 📦 GudangPOS

**Sistem Manajemen Gudang & Point of Sale Terintegrasi**

GudangPOS adalah aplikasi web modern untuk mengelola stok gudang dan transaksi kasir secara real-time. Dibangun dengan React, TypeScript, dan Firebase.

---

## ✨ Fitur Utama

### 🛒 Kasir (POS)
- Pencarian produk cepat dan filter per kategori
- Keranjang belanja dengan update stok real-time
- Metode pembayaran: Tunai, QRIS, Debit, Kredit
- Cetak struk thermal printer (80mm)
- Kalkulasi kembalian otomatis

### 📦 Manajemen Inventori
- Tambah, edit, hapus produk dengan foto
- Restock dengan pencatatan batch & tanggal kadaluarsa
- Alert otomatis stok menipis & habis
- Filter & sorting tabel produk
- Pencarian fuzzy (fuse.js)

### 📋 Purchase Order
- Buat PO ke supplier dengan multi-item
- Workflow status: Pending → Received
- Penerimaan barang otomatis update stok
- Pencatatan harga beli per transaksi

### 📊 Dashboard
- Ringkasan penjualan & total transaksi
- Grafik tren penjualan 7 hari terakhir
- Panel peringatan stok menipis
- Shortcut navigasi cepat

### 🗂️ Riwayat Penjualan
- Tabel transaksi lengkap dengan filter tanggal
- Detail per transaksi dengan item breakdown
- **Export CSV** untuk laporan Excel
- Cetak ulang struk transaksi lama

### ⚙️ Pengaturan
- Informasi toko (nama, alamat, telepon, footer struk)
- Preview struk live sebelum disimpan
- Manajemen kategori, satuan, supplier
- User management dengan role (Admin, Kasir, Gudang)

---

## 🚀 Cara Menjalankan

### Prasyarat
- **Node.js** v18 atau lebih baru
- **npm** v9 atau lebih baru
- Akun **Firebase** (sudah dikonfigurasi)

### Instalasi

```bash
# 1. Clone atau ekstrak project
cd gudangpos

# 2. Install dependencies
npm install

# 3. Jalankan development server
npm run dev
```

Buka browser di `http://localhost:3000`

### Build Production

```bash
npm run build
```

Output ada di folder `dist/` — bisa di-deploy ke Firebase Hosting, Vercel, atau Netlify.

---

## 🏗️ Struktur Project

```
gudangpos/
├── public/
│   └── favicon.svg          # Favicon aplikasi
├── src/
│   ├── components/
│   │   ├── Dashboard.tsx    # Halaman dashboard & statistik
│   │   ├── Inventory.tsx    # Manajemen produk & stok
│   │   ├── Layout.tsx       # Layout utama + sidebar + auth
│   │   ├── POS.tsx          # Halaman kasir
│   │   ├── PurchaseOrder.tsx # Purchase order ke supplier
│   │   ├── Receipt.tsx      # Komponen struk cetak
│   │   ├── SalesHistory.tsx # Riwayat & laporan penjualan
│   │   ├── Settings.tsx     # Pengaturan aplikasi
│   │   └── ui/              # Komponen UI (shadcn/base-ui)
│   ├── lib/
│   │   └── firebase.ts      # Konfigurasi Firebase
│   ├── services/
│   │   └── stockService.ts  # Business logic stok & transaksi
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 🔐 Role & Akses

| Fitur | Admin | Kasir | Gudang |
|-------|:-----:|:-----:|:------:|
| Dashboard | ✅ | ✅ | ✅ |
| Inventory | ✅ | ✅ | ✅ |
| Kasir (POS) | ✅ | ✅ | ❌ |
| Riwayat Penjualan | ✅ | ✅ | ❌ |
| Purchase Order | ✅ | ❌ | ✅ |
| Pengaturan | ✅ | ✅ | ✅ |
| User Management | ✅ | ❌ | ❌ |

---

## 🔥 Firebase

Project ini menggunakan Firebase:
- **Authentication** — Login dengan Google
- **Firestore** — Database real-time
- **Analytics** — Analitik penggunaan (opsional)

Koleksi Firestore yang digunakan:
- `products` — Data produk
- `inventory` — Stok per produk
- `sales` — Transaksi penjualan
- `sales/{id}/items` — Item per transaksi
- `purchase_orders` — Purchase order
- `purchase_orders/{id}/items` — Item per PO
- `stock_transactions` — Log mutasi stok
- `categories` — Kategori produk
- `units` — Satuan produk
- `suppliers` — Data supplier
- `users` — Data & role pengguna
- `settings/store` — Informasi toko

---

## 🛠️ Tech Stack

| Teknologi | Versi | Kegunaan |
|-----------|-------|---------|
| React | 19 | UI Framework |
| TypeScript | 5.8 | Type safety |
| Vite | 6 | Build tool |
| Firebase | 12 | Backend & Auth |
| Tailwind CSS | 4 | Styling |
| Recharts | 3 | Grafik |
| React Hook Form | 7 | Form management |
| Zod | 4 | Validasi schema |
| Fuse.js | 7 | Pencarian fuzzy |
| Motion | 12 | Animasi |
| Sonner | 2 | Notifikasi toast |

---

## 📱 Responsive

- ✅ **Desktop** (1280px+) — Sidebar penuh, tabel lengkap
- ✅ **Laptop** (1024–1280px) — Sidebar collapsed, layout adaptif
- ✅ **Tablet** (768–1024px) — Card view, modal full-width
- ✅ **HP** (< 768px) — Bottom sheet, floating cart button

---

## 📄 Lisensi

MIT License — bebas digunakan dan dimodifikasi.

---

*GudangPOS v2.0 — Dibuat dengan ❤️ untuk kemudahan pengelolaan bisnis Anda*
