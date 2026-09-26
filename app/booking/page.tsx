"use client";

import { useEffect, useState } from "react";
import { SLOT_JAM } from "@/lib/constants";

interface Mekanik {
  id: string;
  nama: string;
}
interface Jasa {
  id: string;
  nama: string;
  harga: number;
}
interface Sparepart {
  id: string;
  nama: string;
  harga: number;
  satuan: string;
}

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function BookingPage() {
  const [mekanikList, setMekanikList] = useState<Mekanik[]>([]);
  const [jasaList, setJasaList] = useState<Jasa[]>([]);
  const [sparepartList, setSparepartList] = useState<Sparepart[]>([]);
  const [mekanikId, setMekanikId] = useState("");
  const [tanggal, setTanggal] = useState(todayPlus(1));
  const [jamMulai, setJamMulai] = useState("");
  const [jamTerisi, setJamTerisi] = useState<string[]>([]);
  const [jasaIds, setJasaIds] = useState<string[]>([]);
  const [sparepartQty, setSparepartQty] = useState<Record<string, number>>({});
  const [platNomor, setPlatNomor] = useState("");
  const [merk, setMerk] = useState("");
  const [model, setModel] = useState("");
  const [customerNama, setCustomerNama] = useState("");
  const [customerTelepon, setCustomerTelepon] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/mekanik")
      .then((r) => r.json())
      .then((d) => {
        setMekanikList(d.mekanik ?? []);
        if (d.mekanik?.length) setMekanikId(d.mekanik[0].id);
      });
    fetch("/api/jasa")
      .then((r) => r.json())
      .then((d) => setJasaList(d.jasa ?? []));
    fetch("/api/sparepart")
      .then((r) => r.json())
      .then((d) => setSparepartList(d.spareparts ?? []));
  }, []);

  useEffect(() => {
    if (!mekanikId || !tanggal) return;
    fetch(`/api/booking-slots?mekanikId=${mekanikId}&tanggal=${tanggal}`)
      .then((r) => r.json())
      .then((d) => setJamTerisi(d.jamTerisi ?? []));
  }, [mekanikId, tanggal]);

  function toggleJasa(id: string) {
    setJasaIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const totalJasa = jasaIds.reduce((sum, id) => sum + (jasaList.find((j) => j.id === id)?.harga ?? 0), 0);
  const totalSparepart = Object.entries(sparepartQty).reduce((sum, [id, qty]) => {
    const sp = sparepartList.find((s) => s.id === id);
    return sum + (sp ? sp.harga * qty : 0);
  }, 0);
  const estimasiTotal = totalJasa + totalSparepart;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!mekanikId || !jamMulai) {
      setError("Pilih mekanik dan jam");
      return;
    }
    if (jasaIds.length === 0) {
      setError("Pilih minimal 1 jasa servis");
      return;
    }
    if (!platNomor || !merk || !model || !customerNama || !customerTelepon) {
      setError("Data kendaraan & pelanggan wajib diisi");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mekanikId,
        kendaraan: { platNomor, merk, model, customerNama, customerTelepon },
        tanggal,
        jamMulai,
        jasaIds,
        sparepartEstimasi: Object.entries(sparepartQty)
          .filter(([, qty]) => qty > 0)
          .map(([sparepartId, jumlah]) => ({ sparepartId, jumlah })),
      }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Gagal membuat booking");
      fetch(`/api/booking-slots?mekanikId=${mekanikId}&tanggal=${tanggal}`)
        .then((r) => r.json())
        .then((d) => setJamTerisi(d.jamTerisi ?? []));
      return;
    }

    setMessage("Booking berhasil dibuat! Silakan datang sesuai jadwal.");
    setJamMulai("");
    setJasaIds([]);
    setSparepartQty({});
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Booking Servis</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Mekanik</label>
            <select
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
              value={mekanikId}
              onChange={(e) => setMekanikId(e.target.value)}
            >
              {mekanikList.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nama}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Tanggal</label>
            <input
              type="date"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
              value={tanggal}
              min={todayPlus(0)}
              onChange={(e) => setTanggal(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Jam</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {SLOT_JAM.map((jam) => {
              const terisi = jamTerisi.includes(jam);
              return (
                <button
                  type="button"
                  key={jam}
                  disabled={terisi}
                  onClick={() => setJamMulai(jam)}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    terisi
                      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                      : jamMulai === jam
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 hover:bg-slate-100"
                  }`}
                >
                  {jam} {terisi ? "(terisi)" : ""}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Jasa Servis</label>
          <div className="mt-1 space-y-1">
            {jasaList.map((j) => (
              <label key={j.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={jasaIds.includes(j.id)}
                  onChange={() => toggleJasa(j.id)}
                />
                {j.nama} - Rp{j.harga.toLocaleString("id-ID")}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Perkiraan Sparepart (opsional)</label>
          <div className="mt-1 space-y-1">
            {sparepartList.map((sp) => (
              <div key={sp.id} className="flex items-center justify-between text-sm">
                <span>
                  {sp.nama} - Rp{sp.harga.toLocaleString("id-ID")}/{sp.satuan}
                </span>
                <input
                  type="number"
                  min={0}
                  className="w-16 rounded-md border border-slate-300 px-2 py-1"
                  value={sparepartQty[sp.id] ?? 0}
                  onChange={(e) =>
                    setSparepartQty((prev) => ({ ...prev, [sp.id]: parseInt(e.target.value) || 0 }))
                  }
                />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="font-medium">Data Kendaraan &amp; Pelanggan</h2>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder="Plat Nomor"
            value={platNomor}
            onChange={(e) => setPlatNomor(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className="rounded-md border border-slate-300 px-3 py-2"
              placeholder="Merk"
              value={merk}
              onChange={(e) => setMerk(e.target.value)}
            />
            <input
              className="rounded-md border border-slate-300 px-3 py-2"
              placeholder="Model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </div>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder="Nama Pemilik"
            value={customerNama}
            onChange={(e) => setCustomerNama(e.target.value)}
          />
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder="Telepon"
            value={customerTelepon}
            onChange={(e) => setCustomerTelepon(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="font-medium">Estimasi Biaya: Rp{estimasiTotal.toLocaleString("id-ID")}</span>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-slate-900 px-5 py-2 text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {submitting ? "Memproses..." : "Booking Sekarang"}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-emerald-600">{message}</p>}
      </form>
    </main>
  );
}
