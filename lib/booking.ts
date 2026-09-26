import { prisma } from "./prisma";
import { toDateOnly } from "./date";
import { BOOKING_STATUS } from "./constants";

interface KendaraanInput {
  platNomor: string;
  merk: string;
  model: string;
  customerNama: string;
  customerTelepon: string;
}

interface CreateBookingInput {
  mekanikId: string;
  kendaraan: KendaraanInput;
  tanggal: string | Date;
  jamMulai: string;
  jasaIds: string[];
  sparepartEstimasi: { sparepartId: string; jumlah: number }[];
  catatan?: string;
}

export class EmptyJasaError extends Error {
  constructor() {
    super("Booking harus memiliki minimal 1 jasa servis");
  }
}

export class JasaNotFoundError extends Error {
  constructor(id: string) {
    super(`Jasa servis ${id} tidak ditemukan atau tidak aktif`);
  }
}

export class SparepartNotFoundError extends Error {
  constructor(id: string) {
    super(`Sparepart ${id} tidak ditemukan`);
  }
}

export class MekanikNotFoundError extends Error {
  constructor() {
    super("Mekanik tidak ditemukan atau tidak aktif");
  }
}

export class SlotConflictError extends Error {
  constructor() {
    super("Slot jadwal mekanik ini pada tanggal & jam tersebut sudah dibooking orang lain");
  }
}

/**
 * Membuat booking baru.
 *
 * ANTI-BENTROK JADWAL: booking langsung di-INSERT ke tabel `Booking` yang
 * memiliki `@@unique([mekanikId, tanggal, jamMulai])` di level database.
 * Kita TIDAK melakukan "cek dulu apakah slot kosong, baru insert" (pola ini
 * rentan race condition: dua request bisa lolos cek bersamaan sebelum
 * salah satunya insert). Sebaliknya, insert langsung dicoba; jika ada
 * booking lain yang sudah menempati slot yang sama (baik yang dibuat
 * sepersekian detik sebelumnya maupun yang sedang diproses bersamaan),
 * database akan menolak insert kedua dengan error unique constraint
 * (Prisma `P2002`), yang kita tangkap dan lempar ulang sebagai
 * `SlotConflictError`.
 */
export async function createBooking(input: CreateBookingInput) {
  if (!input.jasaIds || input.jasaIds.length === 0) {
    throw new EmptyJasaError();
  }

  const mekanik = await prisma.mekanik.findFirst({
    where: { id: input.mekanikId, aktif: true },
  });
  if (!mekanik) throw new MekanikNotFoundError();

  const jasaList = await prisma.jasaServis.findMany({
    where: { id: { in: input.jasaIds }, aktif: true },
  });
  const jasaMap = new Map(jasaList.map((j) => [j.id, j]));
  for (const id of input.jasaIds) {
    if (!jasaMap.has(id)) throw new JasaNotFoundError(id);
  }

  const sparepartIds = input.sparepartEstimasi.map((s) => s.sparepartId);
  const spareparts = await prisma.sparepart.findMany({ where: { id: { in: sparepartIds } } });
  const sparepartMap = new Map(spareparts.map((s) => [s.id, s]));
  for (const id of sparepartIds) {
    if (!sparepartMap.has(id)) throw new SparepartNotFoundError(id);
  }

  const totalJasa = input.jasaIds.reduce((sum, id) => sum + jasaMap.get(id)!.harga, 0);
  const totalSparepartEstimasi = input.sparepartEstimasi.reduce((sum, item) => {
    const sp = sparepartMap.get(item.sparepartId)!;
    return sum + sp.harga * item.jumlah;
  }, 0);
  const estimasiTotal = totalJasa + totalSparepartEstimasi;

  const tanggal = toDateOnly(input.tanggal);

  try {
    const booking = await prisma.$transaction(async (tx) => {
      const kendaraan = await tx.kendaraan.upsert({
        where: { platNomor: input.kendaraan.platNomor.toUpperCase().trim() },
        update: {
          merk: input.kendaraan.merk,
          model: input.kendaraan.model,
          customerNama: input.kendaraan.customerNama,
          customerTelepon: input.kendaraan.customerTelepon,
        },
        create: {
          platNomor: input.kendaraan.platNomor.toUpperCase().trim(),
          merk: input.kendaraan.merk,
          model: input.kendaraan.model,
          customerNama: input.kendaraan.customerNama,
          customerTelepon: input.kendaraan.customerTelepon,
        },
      });

      return tx.booking.create({
        data: {
          mekanikId: input.mekanikId,
          kendaraanId: kendaraan.id,
          tanggal,
          jamMulai: input.jamMulai,
          status: BOOKING_STATUS.BOOKED,
          estimasiTotal,
          catatan: input.catatan,
          jasas: {
            create: input.jasaIds.map((id) => {
              const j = jasaMap.get(id)!;
              return { jasaServisId: id, namaSnapshot: j.nama, hargaSnapshot: j.harga };
            }),
          },
          sparepartEstimasi: {
            create: input.sparepartEstimasi.map((item) => {
              const sp = sparepartMap.get(item.sparepartId)!;
              return {
                sparepartId: item.sparepartId,
                namaSnapshot: sp.nama,
                hargaSnapshot: sp.harga,
                jumlahEstimasi: item.jumlah,
              };
            }),
          },
        },
        include: { jasas: true, sparepartEstimasi: true, kendaraan: true, mekanik: true },
      });
    });

    return booking;
  } catch (err: unknown) {
    const prismaErr = err as { code?: string; meta?: { target?: string[] } };
    if (prismaErr?.code === "P2002") {
      throw new SlotConflictError();
    }
    throw err;
  }
}
