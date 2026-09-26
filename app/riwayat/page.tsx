"use client";

import { useState } from "react";
import { BOOKING_STATUS } from "@/lib/constants";

interface BookingHistoryRow {
  id: string;
  tanggal: string;
  jamMulai: string;
  status: string;
  estimasiTotal: number;
  totalAktual: number | null;
  mekanik: { nama: string };
  jasas: { namaSnapshot: string; hargaSnapshot: number }[];
  sparepartAktual: { namaSnapshot: string; jumlahAktual: number; hargaSnapshot: number }[];
}

interface KendaraanResult {
  platNomor: string;
  merk: string;
  model: string;
  customerNama: string;
  bookings: BookingHistoryRow[];
}

const STATUS_LABEL: Record<string, string> = {
  BOOKED: "Terjadwal",
  SELESAI: "Selesai",
  DIBATALKAN: "Dibatalkan",
};

export default function RiwayatPage() {
  const [plat, setPlat] = useState("");
  const [result, setResult] = useState<KendaraanResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!plat.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    const res = await fetch(`/api/riwayat/${encodeURIComponent(plat.trim())}`);
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Plat nomor tidak ditemukan");
      return;
    }
    const data = await res.json();
    setResult(data.kendaraan);
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Riwayat Servis</h1>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          className="flex-1 rounded-md border border-slate-300 px-3 py-2"
          placeholder="Masukkan plat nomor"
          value={plat}
          onChange={(e) => setPlat(e.target.value)}
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-700 disabled:opacity-50"
        >
          Cek
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="font-mono font-semibold">{result.platNomor}</p>
            <p className="text-sm text-slate-500">
              {result.merk} {result.model} - {result.customerNama}
            </p>
          </div>

          {result.bookings.length === 0 ? (
            <p className="text-sm text-slate-500">Belum ada riwayat servis.</p>
          ) : (
            result.bookings.map((b) => (
              <div key={b.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">
                    {b.tanggal.slice(0, 10)} - {b.jamMulai} ({b.mekanik.nama})
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      b.status === BOOKING_STATUS.SELESAI
                        ? "bg-emerald-100 text-emerald-700"
                        : b.status === BOOKING_STATUS.DIBATALKAN
                        ? "bg-red-100 text-red-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {STATUS_LABEL[b.status] ?? b.status}
                  </span>
                </div>
                <ul className="mt-2 space-y-0.5 text-sm text-slate-600">
                  {b.jasas.map((j, idx) => (
                    <li key={idx}>
                      {j.namaSnapshot} - Rp{j.hargaSnapshot.toLocaleString("id-ID")}
                    </li>
                  ))}
                  {b.sparepartAktual.map((s, idx) => (
                    <li key={idx}>
                      {s.namaSnapshot} x{s.jumlahAktual} - Rp
                      {(s.hargaSnapshot * s.jumlahAktual).toLocaleString("id-ID")}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-right font-medium">
                  {b.status === BOOKING_STATUS.SELESAI
                    ? `Total: Rp${(b.totalAktual ?? 0).toLocaleString("id-ID")}`
                    : `Estimasi: Rp${b.estimasiTotal.toLocaleString("id-ID")}`}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </main>
  );
}
