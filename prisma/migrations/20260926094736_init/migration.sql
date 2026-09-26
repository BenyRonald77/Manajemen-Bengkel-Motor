-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Mekanik" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nama" TEXT NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Kendaraan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platNomor" TEXT NOT NULL,
    "merk" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "customerNama" TEXT NOT NULL,
    "customerTelepon" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "JasaServis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nama" TEXT NOT NULL,
    "harga" REAL NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Sparepart" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nama" TEXT NOT NULL,
    "satuan" TEXT NOT NULL,
    "harga" REAL NOT NULL,
    "stok" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mekanikId" TEXT NOT NULL,
    "kendaraanId" TEXT NOT NULL,
    "tanggal" DATETIME NOT NULL,
    "jamMulai" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BOOKED',
    "estimasiTotal" REAL NOT NULL,
    "totalAktual" REAL,
    "catatan" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Booking_mekanikId_fkey" FOREIGN KEY ("mekanikId") REFERENCES "Mekanik" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_kendaraanId_fkey" FOREIGN KEY ("kendaraanId") REFERENCES "Kendaraan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BookingJasa" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "jasaServisId" TEXT NOT NULL,
    "namaSnapshot" TEXT NOT NULL,
    "hargaSnapshot" REAL NOT NULL,
    CONSTRAINT "BookingJasa_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BookingJasa_jasaServisId_fkey" FOREIGN KEY ("jasaServisId") REFERENCES "JasaServis" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BookingSparepartEstimasi" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "sparepartId" TEXT NOT NULL,
    "namaSnapshot" TEXT NOT NULL,
    "hargaSnapshot" REAL NOT NULL,
    "jumlahEstimasi" INTEGER NOT NULL,
    CONSTRAINT "BookingSparepartEstimasi_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BookingSparepartEstimasi_sparepartId_fkey" FOREIGN KEY ("sparepartId") REFERENCES "Sparepart" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BookingSparepartAktual" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "sparepartId" TEXT NOT NULL,
    "namaSnapshot" TEXT NOT NULL,
    "hargaSnapshot" REAL NOT NULL,
    "jumlahAktual" INTEGER NOT NULL,
    CONSTRAINT "BookingSparepartAktual_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BookingSparepartAktual_sparepartId_fkey" FOREIGN KEY ("sparepartId") REFERENCES "Sparepart" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_username_key" ON "Admin"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Kendaraan_platNomor_key" ON "Kendaraan"("platNomor");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_mekanikId_tanggal_jamMulai_key" ON "Booking"("mekanikId", "tanggal", "jamMulai");
