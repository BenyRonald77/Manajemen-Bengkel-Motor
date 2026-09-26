/**
 * Script verifikasi konkurensi terhadap DATABASE LIVE (SQLite dev.db).
 * Jalankan: npm run verify:concurrency
 */
import { prisma } from "../lib/prisma";
import { createBooking, SlotConflictError } from "../lib/booking";
import { completeService, InsufficientStockError } from "../lib/complete-service";
import { getRiwayatByPlatNomor } from "../lib/riwayat";
import { toDateOnly } from "../lib/date";
import { BOOKING_STATUS } from "../lib/constants";

let pass = 0;
let fail = 0;
function ok(desc: string) {
  pass++;
  console.log(`  PASS - ${desc}`);
}
function bad(desc: string) {
  fail++;
  console.log(`  FAIL - ${desc}`);
}

async function cleanupPreviousRun() {
  const platNomors = [
    "VERIFY-1234",
    "VERIFY-5678",
    "VERIFY-9999",
    ...Array.from({ length: 10 }, (_, i) => `VERIFY-STOK-${i}`),
    ...Array.from({ length: 10 }, (_, i) => `VERIFY-SLOT-${i}`),
  ];
  const kendaraans = await prisma.kendaraan.findMany({ where: { platNomor: { in: platNomors } } });
  const kendaraanIds = kendaraans.map((k) => k.id);
  const bookings = await prisma.booking.findMany({ where: { kendaraanId: { in: kendaraanIds } } });
  const bookingIds = bookings.map((b) => b.id);

  await prisma.bookingSparepartAktual.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await prisma.bookingSparepartEstimasi.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await prisma.bookingJasa.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
  await prisma.kendaraan.deleteMany({ where: { id: { in: kendaraanIds } } });
}

async function ensureFixtures() {
  const mekanik = await prisma.mekanik.upsert({
    where: { id: "verify-mekanik-1" },
    update: { aktif: true },
    create: { id: "verify-mekanik-1", nama: "[verify] Mekanik 1" },
  });
  const jasa = await prisma.jasaServis.upsert({
    where: { id: "verify-jasa-1" },
    update: { harga: 50000, aktif: true },
    create: { id: "verify-jasa-1", nama: "[verify] Servis Ringan", harga: 50000 },
  });
  const sparepart = await prisma.sparepart.upsert({
    where: { id: "verify-sparepart-1" },
    update: { harga: 40000 },
    create: { id: "verify-sparepart-1", nama: "[verify] Oli", satuan: "liter", harga: 40000, stok: 9999 },
  });
  return { mekanik, jasa, sparepart };
}

function kendaraanInput(platNomor: string) {
  return {
    platNomor,
    merk: "Honda",
    model: "Beat",
    customerNama: `Verify ${platNomor}`,
    customerTelepon: "081200000000",
  };
}

async function scenario1_slotConflict() {
  console.log("\n[Skenario 1] 10 booking konkuren untuk mekanik+tanggal+jam yang sama");
  const { mekanik, jasa } = await ensureFixtures();
  const tanggal = toDateOnly(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  const jamMulai = "09:00";

  const results = await Promise.allSettled(
    Array.from({ length: 10 }).map((_, i) =>
      createBooking({
        mekanikId: mekanik.id,
        kendaraan: kendaraanInput(`VERIFY-SLOT-${i}`),
        tanggal,
        jamMulai,
        jasaIds: [jasa.id],
        sparepartEstimasi: [],
      })
    )
  );

  const succeeded = results.filter((r) => r.status === "fulfilled");
  const failed = results.filter((r) => r.status === "rejected");
  const conflictFails = failed.filter(
    (r) => r.status === "rejected" && r.reason instanceof SlotConflictError
  );

  console.log(`  -> sukses: ${succeeded.length}, gagal: ${failed.length} (slot conflict: ${conflictFails.length})`);

  if (succeeded.length === 1) ok("Tepat 1 dari 10 booking berhasil untuk slot yang sama");
  else bad(`Diharapkan tepat 1 booking sukses, didapat ${succeeded.length}`);

  if (failed.length === 9 && conflictFails.length === 9) {
    ok("9 booking lainnya gagal dengan SlotConflictError");
  } else {
    bad(`Diharapkan 9 gagal dgn SlotConflictError, didapat ${failed.length} gagal (${conflictFails.length} conflict)`);
  }

  const totalBookingSlotIni = await prisma.booking.count({
    where: { mekanikId: mekanik.id, tanggal, jamMulai },
  });
  if (totalBookingSlotIni === 1) {
    ok("Hanya ada 1 baris Booking tersimpan untuk slot ini di database");
  } else {
    bad(`Ada ${totalBookingSlotIni} baris Booking untuk slot yang sama, diharapkan 1`);
  }

  // bersihkan booking sukses supaya tidak mengganggu run berikutnya
  const sisaBooking = await prisma.booking.findMany({
    where: { mekanikId: mekanik.id, tanggal, jamMulai },
  });
  const sisaIds = sisaBooking.map((b) => b.id);
  await prisma.bookingJasa.deleteMany({ where: { bookingId: { in: sisaIds } } });
  await prisma.bookingSparepartEstimasi.deleteMany({ where: { bookingId: { in: sisaIds } } });
  await prisma.bookingSparepartAktual.deleteMany({ where: { bookingId: { in: sisaIds } } });
  await prisma.booking.deleteMany({ where: { id: { in: sisaIds } } });
}

async function scenario2_estimasiSnapshot() {
  console.log("\n[Skenario 2] Estimasi biaya (jasa + sparepart) & snapshot harga");
  const { mekanik, jasa, sparepart } = await ensureFixtures();
  const tanggal = toDateOnly(new Date(Date.now() + 31 * 24 * 60 * 60 * 1000));

  const booking = await createBooking({
    mekanikId: mekanik.id,
    kendaraan: kendaraanInput("VERIFY-1234"),
    tanggal,
    jamMulai: "10:00",
    jasaIds: [jasa.id],
    sparepartEstimasi: [{ sparepartId: sparepart.id, jumlah: 2 }],
  });

  const expected = 50000 + 2 * 40000;
  if (booking.estimasiTotal === expected) {
    ok(`Estimasi total benar: ${booking.estimasiTotal} (manual: ${expected})`);
  } else {
    bad(`Estimasi total salah: got ${booking.estimasiTotal}, expected ${expected}`);
  }

  // ubah harga katalog, snapshot booking tidak boleh berubah
  await prisma.jasaServis.update({ where: { id: jasa.id }, data: { harga: 999999 } });
  await prisma.sparepart.update({ where: { id: sparepart.id }, data: { harga: 999999 } });

  const rereadJasa = await prisma.bookingJasa.findFirstOrThrow({ where: { bookingId: booking.id } });
  const rereadSparepart = await prisma.bookingSparepartEstimasi.findFirstOrThrow({
    where: { bookingId: booking.id },
  });

  if (rereadJasa.hargaSnapshot === 50000 && rereadSparepart.hargaSnapshot === 40000) {
    ok("Snapshot harga jasa & sparepart estimasi TIDAK berubah walau katalog diubah");
  } else {
    bad(
      `Snapshot berubah! jasa=${rereadJasa.hargaSnapshot}, sparepart=${rereadSparepart.hargaSnapshot}`
    );
  }

  // restore harga katalog
  await prisma.jasaServis.update({ where: { id: jasa.id }, data: { harga: 50000 } });
  await prisma.sparepart.update({ where: { id: sparepart.id }, data: { harga: 40000 } });
}

async function scenario3_stockRace() {
  console.log("\n[Skenario 3] Stok kecil (5), 10 penyelesaian servis konkuren pakai sparepart yang sama");
  const { mekanik, jasa } = await ensureFixtures();
  const sparepartKecil = await prisma.sparepart.upsert({
    where: { id: "verify-sparepart-stok-kecil" },
    update: { stok: 5, harga: 30000 },
    create: { id: "verify-sparepart-stok-kecil", nama: "[verify] Kampas Rem", satuan: "pcs", harga: 30000, stok: 5 },
  });

  const tanggal = toDateOnly(new Date(Date.now() + 32 * 24 * 60 * 60 * 1000));
  const bookings = [];
  for (let i = 0; i < 10; i++) {
    const b = await createBooking({
      mekanikId: mekanik.id,
      kendaraan: kendaraanInput(`VERIFY-STOK-${i}`),
      tanggal,
      jamMulai: `0${8 + Math.floor(i / 2)}:${i % 2 === 0 ? "00" : "30"}`,
      jasaIds: [jasa.id],
      sparepartEstimasi: [],
    });
    bookings.push(b);
  }

  const results = await Promise.allSettled(
    bookings.map((b) =>
      completeService(b.id, [{ sparepartId: sparepartKecil.id, jumlah: 1 }])
    )
  );

  const succeeded = results.filter((r) => r.status === "fulfilled");
  const failed = results.filter((r) => r.status === "rejected");
  const stockFails = failed.filter(
    (r) => r.status === "rejected" && r.reason instanceof InsufficientStockError
  );

  console.log(`  -> sukses: ${succeeded.length}, gagal: ${failed.length} (stok kurang: ${stockFails.length})`);

  if (succeeded.length === 5) ok("Tepat 5 dari 10 penyelesaian servis berhasil (sesuai stok)");
  else bad(`Diharapkan 5 sukses, didapat ${succeeded.length}`);

  if (failed.length === 5 && stockFails.length === 5) {
    ok("5 penyelesaian lainnya gagal dengan InsufficientStockError");
  } else {
    bad(`Diharapkan 5 gagal dgn InsufficientStockError, didapat ${failed.length} gagal (${stockFails.length} stock)`);
  }

  const finalSparepart = await prisma.sparepart.findUniqueOrThrow({
    where: { id: sparepartKecil.id },
  });
  if (finalSparepart.stok === 0) {
    ok("Stok akhir tepat 0 (tidak pernah negatif, tidak overshoot)");
  } else {
    bad(`Stok akhir = ${finalSparepart.stok}, diharapkan 0`);
  }

  const bookingsBooked = await prisma.booking.count({
    where: { id: { in: bookings.map((b) => b.id) }, status: BOOKING_STATUS.BOOKED },
  });
  if (bookingsBooked === 5) {
    ok("5 booking yang gagal diselesaikan tetap berstatus BOOKED (rollback penuh, bukan setengah jalan)");
  } else {
    bad(`Ada ${bookingsBooked} booking yang masih BOOKED, diharapkan 5 (rollback tidak sempurna)`);
  }
}

async function scenario4_riwayatPlatNomor() {
  console.log("\n[Skenario 4] Riwayat servis per plat nomor lintas status");
  const { mekanik, jasa, sparepart } = await ensureFixtures();
  const plat = "VERIFY-9999";
  const tanggal1 = toDateOnly(new Date(Date.now() + 33 * 24 * 60 * 60 * 1000));
  const tanggal2 = toDateOnly(new Date(Date.now() + 34 * 24 * 60 * 60 * 1000));
  const tanggal3 = toDateOnly(new Date(Date.now() + 35 * 24 * 60 * 60 * 1000));

  const b1 = await createBooking({
    mekanikId: mekanik.id,
    kendaraan: kendaraanInput(plat),
    tanggal: tanggal1,
    jamMulai: "11:00",
    jasaIds: [jasa.id],
    sparepartEstimasi: [{ sparepartId: sparepart.id, jumlah: 1 }],
  });
  await completeService(b1.id, [{ sparepartId: sparepart.id, jumlah: 1 }]);

  const b2 = await createBooking({
    mekanikId: mekanik.id,
    kendaraan: kendaraanInput(plat),
    tanggal: tanggal2,
    jamMulai: "11:00",
    jasaIds: [jasa.id],
    sparepartEstimasi: [],
  });
  await prisma.booking.update({ where: { id: b2.id }, data: { status: BOOKING_STATUS.DIBATALKAN } });

  const b3 = await createBooking({
    mekanikId: mekanik.id,
    kendaraan: kendaraanInput(plat),
    tanggal: tanggal3,
    jamMulai: "11:00",
    jasaIds: [jasa.id],
    sparepartEstimasi: [],
  });

  const riwayat = await getRiwayatByPlatNomor(plat);
  if (!riwayat) {
    bad("Riwayat tidak ditemukan untuk plat nomor yang baru dibooking");
    return;
  }

  if (riwayat.bookings.length === 3) {
    ok("Riwayat menampilkan semua 3 kunjungan (lintas status BOOKED/SELESAI/DIBATALKAN)");
  } else {
    bad(`Riwayat menampilkan ${riwayat.bookings.length} kunjungan, diharapkan 3`);
  }

  const statuses = riwayat.bookings.map((b) => b.status);
  if (
    statuses.includes(BOOKING_STATUS.SELESAI) &&
    statuses.includes(BOOKING_STATUS.DIBATALKAN) &&
    statuses.includes(BOOKING_STATUS.BOOKED)
  ) {
    ok("Riwayat mencakup ketiga status yang berbeda");
  } else {
    bad(`Status yang muncul di riwayat: ${statuses.join(", ")}`);
  }

  const urutanTanggalDescending = riwayat.bookings.every(
    (b, idx) => idx === 0 || riwayat.bookings[idx - 1].tanggal.getTime() >= b.tanggal.getTime()
  );
  if (urutanTanggalDescending) {
    ok("Riwayat diurutkan dari kunjungan terbaru");
  } else {
    bad("Urutan riwayat tidak dari yang terbaru");
  }

  const selesai = riwayat.bookings.find((b) => b.status === BOOKING_STATUS.SELESAI)!;
  const expectedTotalAktual = 50000 + 40000; // jasa + 1 sparepart
  if (selesai.totalAktual === expectedTotalAktual) {
    ok(`Detail biaya booking SELESAI benar: totalAktual=${selesai.totalAktual}`);
  } else {
    bad(`totalAktual booking SELESAI = ${selesai.totalAktual}, diharapkan ${expectedTotalAktual}`);
  }
}

async function main() {
  console.log("=== Verifikasi Konkurensi Manajemen Bengkel Motor (database live) ===");
  await cleanupPreviousRun();
  await scenario1_slotConflict();
  await scenario2_estimasiSnapshot();
  await scenario3_stockRace();
  await scenario4_riwayatPlatNomor();

  console.log(`\n=== Hasil: ${pass} PASS, ${fail} FAIL ===`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("Verifikasi crash:", e);
  await prisma.$disconnect();
  process.exit(1);
});
