# PRD — Manajemen Bengkel Motor

## 1. Latar Belakang & Tujuan

Aplikasi manajemen bengkel motor: booking servis per mekanik dengan slot
jadwal yang tidak boleh bentrok, estimasi biaya sebelum dikerjakan, riwayat
servis per plat nomor, dan stok sparepart yang otomatis berkurang saat
dipakai.

Tujuan utama:
- Pelanggan bisa booking servis (pilih mekanik, tanggal, jam) tanpa risiko
  dua booking jatuh di slot mekanik+waktu yang sama meski dibuat bersamaan.
- Sebelum servis dikerjakan, pelanggan melihat estimasi biaya (jasa +
  perkiraan sparepart) yang di-snapshot saat booking dibuat.
- Saat servis ditandai selesai, admin memasukkan sparepart **aktual** yang
  dipakai; stok berkurang otomatis dan tidak mungkin menjadi negatif walau
  banyak servis diselesaikan bersamaan dengan sparepart yang sama.
- Riwayat servis per plat nomor menampilkan semua kunjungan lintas status
  dengan detail biaya yang benar.

## 2. Aktor

- **Admin** — login, kelola mekanik/jasa/sparepart, lihat & selesaikan
  booking.
- **Pelanggan** — tidak login, booking lewat `/booking`, cek riwayat lewat
  `/riwayat`.

## 3. Model Data (Prisma / SQLite)

```
Admin
  id, username (unique), passwordHash, createdAt

Mekanik
  id, nama, aktif, createdAt

Kendaraan
  id, platNomor (unique), merk, model, customerNama, customerTelepon, createdAt

JasaServis
  id, nama, harga, aktif, createdAt, updatedAt

Sparepart
  id, nama, satuan, harga, stok, createdAt, updatedAt

// status: "BOOKED" | "SELESAI" | "DIBATALKAN"
Booking
  id, mekanikId, kendaraanId, tanggal (date-only), jamMulai (string "HH:mm"),
  status, estimasiTotal, catatan, createdAt, updatedAt
  unique(mekanikId, tanggal, jamMulai)

BookingJasa
  id, bookingId, jasaServisId, namaSnapshot, hargaSnapshot

BookingSparepartEstimasi
  id, bookingId, sparepartId, namaSnapshot, hargaSnapshot, jumlahEstimasi

BookingSparepartAktual
  id, bookingId, sparepartId, namaSnapshot, hargaSnapshot, jumlahAktual
```

Kunci desain: harga jasa & sparepart di-snapshot pada `BookingJasa` /
`BookingSparepartEstimasi` saat booking dibuat, dan pada
`BookingSparepartAktual` saat servis diselesaikan — perubahan katalog di
kemudian hari tidak mengubah nilai booking/riwayat yang sudah ada.

## 4. Anti-Bentrok Jadwal (Database-Level Constraint)

Alih-alih mengecek dulu ("apakah slot ini kosong?") lalu insert (rentan race
condition antara cek dan insert), booking **langsung di-insert** ke
database yang memiliki:

```prisma
@@unique([mekanikId, tanggal, jamMulai])
```

Jika dua request booking untuk mekanik+tanggal+jam yang sama terjadi hampir
bersamaan, insert kedua akan gagal dengan error Prisma `P2002` (unique
constraint violation), yang ditangkap di kode aplikasi dan dilempar ulang
sebagai `SlotConflictError` dengan pesan yang jelas ke pelanggan/admin.
Pendekatan ini menjamin tidak ada dua booking valid pada slot yang sama,
dijamin oleh database itu sendiri, bukan oleh logika aplikasi yang bisa
kalah race.

## 5. Estimasi Biaya

- `estimasiTotal` = SUM(harga jasa yang dipilih) + SUM(harga sparepart
  perkiraan x jumlah perkiraan), dihitung & disnapshot ke
  `BookingJasa`/`BookingSparepartEstimasi` saat booking dibuat.
- Perubahan harga jasa/sparepart di katalog setelah booking dibuat tidak
  mempengaruhi `estimasiTotal` booking yang sudah ada.

## 6. Penyelesaian Servis & Stok Sparepart Atomik

- Saat admin menandai booking `SELESAI`, admin memasukkan sparepart
  **aktual** yang dipakai (bisa berbeda dari estimasi - jumlah/jenis).
- Untuk setiap sparepart aktual, stok dikurangi dengan **satu UPDATE
  atomik**:

  ```sql
  UPDATE Sparepart
  SET stok = stok - :jumlah
  WHERE id = :id AND stok >= :jumlah
  ```

  Jika baris terdampak 0 (stok tidak cukup), error dilempar dan **seluruh**
  proses penyelesaian servis (termasuk sparepart lain dalam servis yang
  sama serta perubahan status booking) di-rollback dalam satu
  `prisma.$transaction` - all-or-nothing.
- Total biaya aktual = SUM(harga jasa) + SUM(harga sparepart aktual x
  jumlah aktual), dihitung & disimpan sebagai bagian dari riwayat booking.

## 7. Verifikasi Wajib (dijalankan sebagai script terhadap database live)

1. **Anti-bentrok jadwal**: 10 booking konkuren untuk mekanik+slot yang
   sama -> tepat 1 berhasil, 9 gagal dengan `SlotConflictError` (via P2002),
   bukan hasil pengecekan manual yang rentan race.
2. **Estimasi biaya**: booking dibuat dengan kombinasi jasa+sparepart
   perkiraan, `estimasiTotal` dicocokkan manual; setelah itu harga katalog
   diubah, dipastikan snapshot `BookingJasa`/`BookingSparepartEstimasi`
   tidak berubah.
3. **Stok sparepart atomik**: stok kecil (misal 5), 10 penyelesaian servis
   konkuren yang memakai sparepart yang sama -> tepat 5 berhasil, 5 gagal
   karena stok tidak cukup, stok akhir tidak pernah negatif.
4. **Riwayat per plat nomor**: beberapa booking (lintas status: BOOKED,
   SELESAI, DIBATALKAN) dibuat untuk satu kendaraan, riwayat menampilkan
   semua kunjungan dengan urutan waktu & detail biaya (estimasi vs aktual)
   yang benar.

Hasil verifikasi didokumentasikan di README (termasuk bug yang ditemukan &
fix-nya).

## 8. Autentikasi

- Admin login via `/login` — JWT httpOnly cookie (bcryptjs + jsonwebtoken).
- `/dashboard/**` dan API mutasi admin memerlukan sesi valid.
- `/booking` dan `/riwayat` bersifat publik, tanpa login.

## 9. Halaman (UI)

- `/booking` — publik: pilih mekanik + tanggal, lihat slot jam yang sudah
  terisi (ditampilkan disabled), isi data kendaraan (plat nomor,
  merk/model, nama/telepon pemilik), pilih jasa & perkiraan sparepart,
  lihat estimasi biaya, submit.
- `/riwayat` — publik: input plat nomor, tampilkan semua booking (lintas
  status) untuk kendaraan tersebut dengan detail biaya.
- `/login` — form login admin.
- `/dashboard` — admin:
  - Daftar booking (filter tanggal/status) dengan tombol "Selesaikan
    Servis" (input sparepart aktual yang dipakai).
  - Tab Stok Sparepart (lihat & tambah stok).

## 10. Stack Teknis

- Next.js 14 (App Router) + TypeScript
- Prisma + SQLite (`DATABASE_URL="file:./dev.db?connection_limit=1&socket_timeout=20"`)
- Tailwind CSS
- Auth: bcryptjs + jsonwebtoken, JWT httpOnly cookie

## 11. Non-Goals

- Tidak ada pembayaran online.
- Tidak ada multi-cabang/multi-tenant.
- Tidak ada notifikasi WA/SMS pengingat booking.
