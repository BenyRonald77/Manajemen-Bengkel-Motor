import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-bold">Bengkel Motor</h1>
      <p className="max-w-md text-slate-600">
        Booking servis dengan estimasi biaya jelas sebelum dikerjakan, dan cek
        riwayat servis kendaraan Anda kapan saja.
      </p>
      <div className="flex gap-4">
        <Link
          href="/booking"
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-white hover:bg-slate-700"
        >
          Booking Servis
        </Link>
        <Link
          href="/riwayat"
          className="rounded-lg border border-slate-300 px-5 py-2.5 hover:bg-slate-100"
        >
          Cek Riwayat
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-slate-300 px-5 py-2.5 hover:bg-slate-100"
        >
          Login Admin
        </Link>
      </div>
    </main>
  );
}
