"use client";

import { useState } from "react";
import BookingListTab from "./BookingListTab";
import StokSparepartTab from "./StokSparepartTab";

const TABS = ["Booking", "Stok Sparepart"] as const;
type Tab = (typeof TABS)[number];

export default function DashboardPage() {
  const [tab, setTab] = useState<Tab>("Booking");

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm ${
              tab === t ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Booking" && <BookingListTab />}
      {tab === "Stok Sparepart" && <StokSparepartTab />}
    </div>
  );
}
