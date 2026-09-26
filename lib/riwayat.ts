import { prisma } from "./prisma";

/**
 * Riwayat servis per plat nomor: semua booking (lintas status BOOKED,
 * SELESAI, DIBATALKAN) untuk satu kendaraan, diurutkan dari yang terbaru,
 * lengkap dengan detail jasa, sparepart estimasi & aktual.
 */
export async function getRiwayatByPlatNomor(platNomor: string) {
  const kendaraan = await prisma.kendaraan.findUnique({
    where: { platNomor: platNomor.toUpperCase().trim() },
    include: {
      bookings: {
        orderBy: [{ tanggal: "desc" }, { jamMulai: "desc" }],
        include: {
          mekanik: true,
          jasas: true,
          sparepartEstimasi: true,
          sparepartAktual: true,
        },
      },
    },
  });

  return kendaraan;
}
