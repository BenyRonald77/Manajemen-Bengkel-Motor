"use client";

import { useEffect, useState } from "react";

interface Sparepart {
  id: string;
  nama: string;
  harga: number;
  satuan: string;
  stok: number;
}

interface BookingRow {
  id: string;
  tanggal: string;
  jamMulai: string;
  status: string;
  estimasiTotal: number;
  totalAktual: number | null;
  mekanik: { nama: string };
  kendaraan: { platNomor: string; customerNama: string };
  jasas: { namaSnapshot: string; hargaSnapshot: number }[];
  sparepartEstimasi: { namaSnapshot: string; jumlahEstimasi: number }[];
}

const STATUS_LABEL: Record<string, string> = {
  BOOKED: "Terjadwal",
  SELESAI: "Selesai",
  DIBATALKAN: "Dibatalkan",
};

export default function BookingListTab() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [spareparts, setSpareparts] = useState<Sparepart[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const qs = statusFilter ? `?status=${statusFilter}` : "";
    const res = await fetch(`/api/bookings${qs}`);
    const data = await res.json();
    setBookings(data.bookings ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    fetch("/api/sparepart")
      .then((r) => r.json())
      .then((d) => setSpareparts(d.spareparts ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {["", "BOOKED", "SELESAI", "DIBATALKAN"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-sm ${
              statusFilter === s ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            {s === "" ? "Semua" : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Memuat...</p>
      ) : bookings.length === 0 ? (
        <p className="text-sm text-slate-500">Belum ada booking.</p>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => (
            <div key={b.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">
                    {b.kendaraan.platNomor} - {b.kendaraan.customerNama}
                  </p>
                  <p className="text-sm text-slate-500">
                    {b.tanggal.slice(0, 10)} {b.jamMulai} - {b.mekanik.nama}
                  </p>
                  <ul className="mt-1 text-sm text-slate-600">
                    {b.jasas.map((j, idx) => (
                      <li key={idx}>{j.namaSnapshot}</li>
                    ))}
                  </ul>
                </div>
                <div className="text-right">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                    {STATUS_LABEL[b.status] ?? b.status}
                  </span>
                  <p className="mt-1 text-sm font-medium">
                    Estimasi: Rp{b.estimasiTotal.toLocaleString("id-ID")}
                  </p>
                </div>
              </div>

              {b.status === "BOOKED" && (
                <div className="mt-3">
                  {openId === b.id ? (
                    <CompleteForm
                      booking={b}
                      spareparts={spareparts}
                      onDone={() => {
                        setOpenId(null);
                        load();
                      }}
                      onCancel={() => setOpenId(null)}
                    />
                  ) : (
                    <button
                      onClick={() => setOpenId(b.id)}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500"
                    >
                      Selesaikan Servis
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompleteForm({
  booking,
  spareparts,
  onDone,
  onCancel,
}: {
  booking: BookingRow;
  spareparts: Sparepart[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleComplete() {
    setSubmitting(true);
    setError("");
    const sparepartAktual = Object.entries(qty)
      .filter(([, jumlah]) => jumlah > 0)
      .map(([sparepartId, jumlah]) => ({ sparepartId, jumlah }));

    const res = await fetch(`/api/bookings/${booking.id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sparepartAktual }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Gagal menyelesaikan servis");
      return;
    }
    onDone();
  }

  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-medium">Sparepart Aktual yang Dipakai</p>
      {spareparts.map((sp) => (
        <div key={sp.id} className="flex items-center justify-between text-sm">
          <span>
            {sp.nama} (stok: {sp.stok})
          </span>
          <input
            type="number"
            min={0}
            className="w-16 rounded-md border border-slate-300 px-2 py-1"
            value={qty[sp.id] ?? 0}
            onChange={(e) => setQty((prev) => ({ ...prev, [sp.id]: parseInt(e.target.value) || 0 }))}
          />
        </div>
      ))}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleComplete}
          disabled={submitting}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {submitting ? "Memproses..." : "Konfirmasi Selesai"}
        </button>
        <button onClick={onCancel} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
          Batal
        </button>
      </div>
    </div>
  );
}
