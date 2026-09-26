import { NextRequest, NextResponse } from "next/server";
import { getRiwayatByPlatNomor } from "@/lib/riwayat";

export async function GET(req: NextRequest, { params }: { params: { plat: string } }) {
  const kendaraan = await getRiwayatByPlatNomor(decodeURIComponent(params.plat));
  if (!kendaraan) {
    return NextResponse.json({ error: "Plat nomor tidak ditemukan" }, { status: 404 });
  }
  return NextResponse.json({ kendaraan });
}
