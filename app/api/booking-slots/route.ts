import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toDateOnly } from "@/lib/date";
import { BOOKING_STATUS } from "@/lib/constants";

/**
 * Publik: daftar jamMulai yang sudah terisi untuk mekanik+tanggal tertentu,
 * dipakai halaman /booking untuk menonaktifkan slot yang sudah dibooking.
 */
export async function GET(req: NextRequest) {
  const mekanikId = req.nextUrl.searchParams.get("mekanikId");
  const tanggalParam = req.nextUrl.searchParams.get("tanggal");
  if (!mekanikId || !tanggalParam) {
    return NextResponse.json({ error: "mekanikId dan tanggal wajib diisi" }, { status: 400 });
  }
  const tanggal = toDateOnly(tanggalParam);

  const bookings = await prisma.booking.findMany({
    where: { mekanikId, tanggal, status: { not: BOOKING_STATUS.DIBATALKAN } },
    select: { jamMulai: true },
  });

  return NextResponse.json({ jamTerisi: bookings.map((b) => b.jamMulai) });
}
