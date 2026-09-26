import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { completeService, BookingNotBookedError, InsufficientStockError } from "@/lib/complete-service";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const actualItems = Array.isArray(body?.sparepartAktual) ? body.sparepartAktual : [];

  try {
    const booking = await completeService(params.id, actualItems);
    return NextResponse.json({ booking });
  } catch (err) {
    if (err instanceof BookingNotBookedError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof InsufficientStockError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Gagal menyelesaikan servis" }, { status: 500 });
  }
}
