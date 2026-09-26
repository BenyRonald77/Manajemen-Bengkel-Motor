import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";

export async function GET() {
  const spareparts = await prisma.sparepart.findMany({ orderBy: { nama: "asc" } });
  return NextResponse.json({ spareparts });
}

export async function POST(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.sparepartId || typeof body?.tambahStok !== "number") {
    return NextResponse.json({ error: "sparepartId dan tambahStok wajib diisi" }, { status: 400 });
  }

  const sparepart = await prisma.sparepart.update({
    where: { id: body.sparepartId },
    data: { stok: { increment: body.tambahStok } },
  });
  return NextResponse.json({ sparepart });
}
