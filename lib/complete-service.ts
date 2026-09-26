import { prisma } from "./prisma";
import { BOOKING_STATUS } from "./constants";

interface ActualSparepartInput {
  sparepartId: string;
  jumlah: number;
}

export class BookingNotBookedError extends Error {
  constructor() {
    super("Booking sudah diselesaikan/dibatalkan sebelumnya, atau tidak ditemukan");
  }
}

export class InsufficientStockError extends Error {
  constructor(namaSparepart: string) {
    super(`Stok sparepart "${namaSparepart}" tidak cukup`);
  }
}

/**
 * Menandai booking selesai dengan sparepart AKTUAL yang dipakai.
 *
 * 1. Guard status BOOKED -> SELESAI dipindahkan lebih dulu dengan
 *    conditional `updateMany` (WHERE status='BOOKED'), mencegah booking
 *    yang sama diselesaikan dua kali secara konkuren.
 * 2. Untuk setiap sparepart aktual, stok dikurangi dengan SATU UPDATE
 *    atomik: `UPDATE Sparepart SET stok = stok - :jumlah WHERE id = :id
 *    AND stok >= :jumlah`. Jika baris terdampak 0 (stok tidak cukup),
 *    error dilempar.
 * 3. Semua langkah di atas dibungkus dalam SATU `prisma.$transaction`,
 *    sehingga jika salah satu sparepart stoknya tidak cukup, SELURUH
 *    proses (termasuk perubahan status booking & pengurangan stok
 *    sparepart lain yang sudah sempat jalan) di-rollback - all-or-nothing.
 */
export async function completeService(bookingId: string, actualItems: ActualSparepartInput[]) {
  return prisma.$transaction(
    async (tx) => {
      const guard = await tx.booking.updateMany({
        where: { id: bookingId, status: BOOKING_STATUS.BOOKED },
        data: { status: BOOKING_STATUS.SELESAI },
      });
      if (guard.count === 0) {
        throw new BookingNotBookedError();
      }

      const booking = await tx.booking.findUniqueOrThrow({
        where: { id: bookingId },
        include: { jasas: true },
      });
      const totalJasa = booking.jasas.reduce((sum, j) => sum + j.hargaSnapshot, 0);

      let totalSparepart = 0;
      for (const item of actualItems) {
        const sparepart = await tx.sparepart.findUniqueOrThrow({
          where: { id: item.sparepartId },
        });

        const affected = await tx.$executeRaw`
          UPDATE Sparepart
          SET stok = stok - ${item.jumlah}
          WHERE id = ${item.sparepartId} AND stok >= ${item.jumlah}
        `;
        if (affected === 0) {
          throw new InsufficientStockError(sparepart.nama);
        }

        totalSparepart += sparepart.harga * item.jumlah;

        await tx.bookingSparepartAktual.create({
          data: {
            bookingId,
            sparepartId: item.sparepartId,
            namaSnapshot: sparepart.nama,
            hargaSnapshot: sparepart.harga,
            jumlahAktual: item.jumlah,
          },
        });
      }

      const totalAktual = totalJasa + totalSparepart;
      return tx.booking.update({
        where: { id: bookingId },
        data: { totalAktual },
        include: { jasas: true, sparepartAktual: true, kendaraan: true, mekanik: true },
      });
    },
    { maxWait: 15000, timeout: 15000 }
  );
}
