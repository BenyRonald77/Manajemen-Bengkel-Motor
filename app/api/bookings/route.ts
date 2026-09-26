import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";
import { toDateOnly } from "@/lib/date";
import {
  createBooking,
  EmptyJasaError,
  JasaNotFoundError,
  SparepartNotFoundError,
  MekanikNotFoundError,
  SlotConflictError,
} from "@/lib/booking";

export async function GET(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tanggalParam = req.nextUrl.searchParams.get("tanggal");
  const status = req.nextUrl.searchParams.get("status");

  const bookings = await prisma.booking.findMany({
    where: {
      ...(tanggalParam ? { tanggal: toDateOnly(tanggalParam) } : {}),
      ...(status ? { status } : {}),
    },
    include: {
      mekanik: true,
      kendaraan: true,
      jasas: true,
      sparepartEstimasi: true,
      sparepartAktual: true,
    },
    orderBy: [{ tanggal: "asc" }, { jamMulai: "asc" }],
  });
  return NextResponse.json({ bookings });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (
    !body?.mekanikId ||
    !body?.kendaraan?.platNomor ||
    !body?.tanggal ||
    !body?.jamMulai ||
    !Array.isArray(body?.jasaIds)
  ) {
    return NextResponse.json({ error: "Data booking tidak lengkap" }, { status: 400 });
  }

  try {
    const booking = await createBooking({
      mekanikId: body.mekanikId,
      kendaraan: body.kendaraan,
      tanggal: body.tanggal,
      jamMulai: body.jamMulai,
      jasaIds: body.jasaIds,
      sparepartEstimasi: body.sparepartEstimasi ?? [],
      catatan: body.catatan,
    });
    return NextResponse.json({ booking }, { status: 201 });
  } catch (err) {
    if (
      err instanceof EmptyJasaError ||
      err instanceof JasaNotFoundError ||
      err instanceof SparepartNotFoundError ||
      err instanceof MekanikNotFoundError
    ) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof SlotConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "Gagal membuat booking" }, { status: 500 });
  }
}
