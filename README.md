# Manajemen Bengkel Motor

Aplikasi manajemen bengkel motor: booking servis per mekanik dengan jadwal
anti-bentrok, estimasi biaya sebelum dikerjakan, riwayat servis per plat
nomor, dan stok sparepart yang otomatis berkurang saat dipakai. Lihat PRD
lengkap di [`docs/PRD.md`](docs/PRD.md).

## Stack

- Next.js 14 (App Router) + TypeScript
- Prisma 5 + SQLite (`file:./dev.db?connection_limit=1&socket_timeout=20`)
- Tailwind CSS
- Auth: bcryptjs + jsonwebtoken, JWT httpOnly cookie

## Menjalankan Secara Lokal

```bash
npm install
cp .env.example .env
npx prisma migrate deploy
npm run seed          # admin (admin/admin123) + 2 mekanik + 4 jasa + 4 sparepart
npm run dev
```

- `/booking` — publik, booking servis
- `/riwayat` — publik, cek riwayat per plat nomor
- `/login` — login admin (`admin` / `admin123`)
- `/dashboard` — kelola booking & stok sparepart

## Arsitektur & Keputusan Desain Penting

### 1. Anti-bentrok jadwal di level database

Alih-alih pola "cek dulu apakah slot kosong, baru insert" (rentan race
condition: dua request bisa lolos pengecekan bersamaan sebelum salah
satunya sempat insert), tabel `Booking` memiliki:

```prisma
@@unique([mekanikId, tanggal, jamMulai])
```

`createBooking` (`lib/booking.ts`) langsung mencoba **insert** booking baru.
Jika slot mekanik+tanggal+jam tersebut sudah terisi (baik dari booking yang
dibuat sepersekian detik sebelumnya maupun yang sedang diproses hampir
bersamaan), database menolak insert dengan error unique constraint
(`P2002`), yang ditangkap dan dilempar ulang sebagai `SlotConflictError`.
Jaminan "tidak ada 2 booking pada slot yang sama" berasal dari database itu
sendiri, bukan dari logika aplikasi yang bisa kalah race.

### 2. Estimasi biaya & snapshot harga

Saat booking dibuat, harga setiap jasa (`BookingJasa.hargaSnapshot`) dan
setiap sparepart perkiraan (`BookingSparepartEstimasi.hargaSnapshot`)
disalin dari katalog (`JasaServis`, `Sparepart`) saat itu.
`Booking.estimasiTotal` adalah SUM dari snapshot-snapshot tersebut.
Perubahan harga katalog setelahnya tidak mengubah nilai booking yang sudah
dibuat.

### 3. Penyelesaian servis & stok sparepart atomik

`completeService` (`lib/complete-service.ts`) melakukan, semuanya di dalam
**satu** `prisma.$transaction` (all-or-nothing):

1. Guard status: conditional `updateMany` (`WHERE status = 'BOOKED'`)
   memindahkan booking ke `SELESAI`. Jika `count === 0`, booking sudah
   diselesaikan/dibatalkan sebelumnya -> `BookingNotBookedError`. Ini
   mencegah booking yang sama diselesaikan dua kali secara konkuren.
2. Untuk setiap sparepart aktual yang dipakai, stok dikurangi dengan
   **satu UPDATE atomik**:

   ```sql
   UPDATE Sparepart SET stok = stok - :jumlah WHERE id = :id AND stok >= :jumlah
   ```

   Jika baris terdampak 0 (stok tidak cukup), `InsufficientStockError`
   dilempar, dan **seluruh** transaksi (termasuk perubahan status booking
   dan pengurangan stok sparepart lain yang sudah sempat jalan dalam servis
   yang sama) di-rollback.
3. `totalAktual` = SUM(harga jasa) + SUM(harga sparepart aktual x jumlah),
   dihitung dan disimpan sebagai bagian dari riwayat booking.

### 4. Riwayat per plat nomor

`getRiwayatByPlatNomor` (`lib/riwayat.ts`) mengambil semua `Booking` milik
satu `Kendaraan` (dicari via `platNomor` unik) lintas status (`BOOKED`,
`SELESAI`, `DIBATALKAN`), diurutkan dari kunjungan terbaru, lengkap dengan
detail jasa & sparepart (estimasi maupun aktual).

## Verifikasi Konkurensi (dijalankan terhadap database live)

Dijalankan dengan `npm run verify:concurrency`
(`scripts/verify-concurrency.ts`) — memanggil `lib/booking.ts`,
`lib/complete-service.ts`, `lib/riwayat.ts` yang hit SQLite `dev.db`
sungguhan.

```
=== Verifikasi Konkurensi Manajemen Bengkel Motor (database live) ===
[Skenario 1] 10 booking konkuren untuk mekanik+tanggal+jam yang sama
  -> sukses: 1, gagal: 9 (slot conflict: 9)
  PASS - Tepat 1 dari 10 booking berhasil untuk slot yang sama
  PASS - 9 booking lainnya gagal dengan SlotConflictError
  PASS - Hanya ada 1 baris Booking tersimpan untuk slot ini di database
[Skenario 2] Estimasi biaya (jasa + sparepart) & snapshot harga
  PASS - Estimasi total benar: 130000 (manual: 130000)
  PASS - Snapshot harga jasa & sparepart estimasi TIDAK berubah walau katalog diubah
[Skenario 3] Stok kecil (5), 10 penyelesaian servis konkuren pakai sparepart yang sama
  -> sukses: 5, gagal: 5 (stok kurang: 5)
  PASS - Tepat 5 dari 10 penyelesaian servis berhasil (sesuai stok)
  PASS - 5 penyelesaian lainnya gagal dengan InsufficientStockError
  PASS - Stok akhir tepat 0 (tidak pernah negatif, tidak overshoot)
  PASS - 5 booking yang gagal diselesaikan tetap berstatus BOOKED (rollback penuh, bukan setengah jalan)
[Skenario 4] Riwayat servis per plat nomor lintas status
  PASS - Riwayat menampilkan semua 3 kunjungan (lintas status BOOKED/SELESAI/DIBATALKAN)
  PASS - Riwayat mencakup ketiga status yang berbeda
  PASS - Riwayat diurutkan dari kunjungan terbaru
  PASS - Detail biaya booking SELESAI benar: totalAktual=90000
=== Hasil: 13 PASS, 0 FAIL ===
```

Script ini aman dijalankan berulang kali (idempotent) — lihat "Bug
Ditemukan & Diperbaiki" di bawah.

## Verifikasi UI (Playwright, browser Chromium sungguhan)

Dijalankan dengan `node scripts/e2e-playwright.js` terhadap `npm run dev` di
`localhost:3000`:

```
[1] Buat booking lewat halaman publik /booking
  PASS - Booking berhasil dibuat lewat halaman publik /booking
[2] Reload /booking, cek slot 08:00 mekanik yang sama sudah disabled
  PASS - Slot 08:00 ditampilkan sebagai terisi (disabled) setelah booking dibuat
[3] Login admin, cek booking baru muncul di dashboard, selesaikan servis
  PASS - Berhasil login admin dan redirect ke /dashboard
  PASS - Booking baru muncul di daftar Booking dashboard admin
  PASS - Servis berhasil ditandai SELESAI dari dashboard admin
[4] Cek /riwayat menampilkan booking dengan status Selesai
  PASS - Halaman /riwayat menampilkan booking dengan status Selesai
[5] Cek plat nomor yang tidak ada -> pesan error
  PASS - Plat nomor yang tidak ada menampilkan pesan error yang jelas

=== Hasil E2E: 7 PASS, 0 FAIL ===
```

`npm run build` (production build) juga sukses tanpa error TypeScript/ESLint.

## Bug yang Ditemukan & Diperbaiki Selama Development

1. **Cleanup script verifikasi tidak mencakup semua plat nomor skenario** —
   `cleanupPreviousRun()` awalnya hanya menghapus data untuk
   `VERIFY-1234/5678/9999` dan `VERIFY-STOK-*`, tapi lupa mencakup
   `VERIFY-SLOT-*` yang dipakai Skenario 1 (uji anti-bentrok jadwal).
   Akibatnya, menjalankan `verify-concurrency.ts` dua kali membuat slot
   pada Skenario 1 sudah terisi dari run sebelumnya, sehingga 0 dari 10
   booking baru berhasil (bukan 1 seperti yang diharapkan). **Fix**:
   menambahkan pola `VERIFY-SLOT-${i}` ke daftar plat nomor yang
   dibersihkan di awal setiap run.
2. **Foreign key violation saat membersihkan booking sisa** — percobaan
   awal membersihkan booking sukses di akhir Skenario 1 langsung memanggil
   `booking.deleteMany()` tanpa menghapus baris anak (`BookingJasa`,
   `BookingSparepartEstimasi`, `BookingSparepartAktual`) terlebih dahulu,
   menyebabkan error `P2003` (foreign key constraint). **Fix**: menghapus
   baris anak dulu sebelum menghapus `Booking` induknya.
3. **Test E2E flaky karena kondisi tunggu terlalu longgar** — langkah "cek
   slot 08:00 sudah disabled setelah reload" awalnya hanya menunggu teks
   "08:00" muncul (yang selalu ada, disabled atau tidak), sehingga kadang
   membaca DOM sebelum data `jamTerisi` selesai di-fetch. **Fix**:
   menunggu teks spesifik `"08:00 (terisi)"` muncul di DOM, bukan sekadar
   `"08:00"`.
4. **E2E memakai tanggal booking yang tetap (H+1), menyebabkan slot
   bentrok antar run** — menjalankan E2E dua kali pada hari yang sama
   membuat slot 08:00 mekanik pertama sudah terisi dari run sebelumnya,
   membuat langkah pemilihan slot timeout. **Fix**: E2E memilih tanggal
   booking secara acak jauh di masa depan setiap run, sehingga setiap
   eksekusi test memakai slot yang pasti kosong.
5. **`create-next-app` menimpa `.gitignore` kustom** — sama seperti dua
   proyek sebelumnya, scaffold menulis ulang `.gitignore` default yang
   tidak mengecualikan `.env` biasa atau `prisma/dev.db`, ditemukan dari
   `git status --short` sebelum commit pertama dan diperbaiki dengan
   menambahkan kembali aturan yang dibutuhkan.

## Struktur Model Data

Lihat `prisma/schema.prisma` — `Admin`, `Mekanik`, `Kendaraan`,
`JasaServis`, `Sparepart`, `Booking`, `BookingJasa`,
`BookingSparepartEstimasi`, `BookingSparepartAktual`.

## Login Default (development/seed)

- Username: `admin`
- Password: `admin123`

Ganti kredensial ini sebelum deploy ke production.
