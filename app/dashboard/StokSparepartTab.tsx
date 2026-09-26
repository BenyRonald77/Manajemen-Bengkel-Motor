"use client";

import { useEffect, useState } from "react";

interface Sparepart {
  id: string;
  nama: string;
  satuan: string;
  harga: number;
  stok: number;
}

export default function StokSparepartTab() {
  const [spareparts, setSpareparts] = useState<Sparepart[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/sparepart");
    const data = await res.json();
    setSpareparts(data.spareparts ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function tambahStok(sparepartId: string, jumlah: number) {
    await fetch("/api/sparepart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sparepartId, tambahStok: jumlah }),
    });
    load();
  }

  if (loading) return <p className="text-sm text-slate-500">Memuat...</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-2">Sparepart</th>
            <th className="px-4 py-2">Harga</th>
            <th className="px-4 py-2">Stok</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {spareparts.map((sp) => (
            <SparepartRow key={sp.id} sparepart={sp} onTambah={tambahStok} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SparepartRow({
  sparepart,
  onTambah,
}: {
  sparepart: Sparepart;
  onTambah: (id: string, jumlah: number) => void;
}) {
  const [jumlah, setJumlah] = useState(10);
  return (
    <tr className="border-t border-slate-100">
      <td className="px-4 py-2">
        {sparepart.nama} ({sparepart.satuan})
      </td>
      <td className="px-4 py-2">Rp{sparepart.harga.toLocaleString("id-ID")}</td>
      <td className="px-4 py-2">{sparepart.stok}</td>
      <td className="px-4 py-2 text-right">
        <div className="flex items-center justify-end gap-2">
          <input
            type="number"
            min={1}
            className="w-16 rounded-md border border-slate-300 px-2 py-1"
            value={jumlah}
            onChange={(e) => setJumlah(parseInt(e.target.value) || 0)}
          />
          <button
            onClick={() => onTambah(sparepart.id, jumlah)}
            className="rounded-md border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100"
          >
            + Tambah Stok
          </button>
        </div>
      </td>
    </tr>
  );
}
