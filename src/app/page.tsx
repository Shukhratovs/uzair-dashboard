"use client";

import { useEffect, useState } from "react";

type DailyRow = {
  from: string;
  to: string;
  fromName: string;
  toName: string;
  count: number;
  transitHubCode?: string;
  transitHubName?: string;
  transitCount?: number;
  aircraftCodes?: string[];
  seatsAvailable?: number;
  aircraftLabel?: string;
};

type DailyResponse = {
  date: string;
  flightClass: string;
  from: string;
  fromName: string;
  total: number;
  routes: DailyRow[];
  note?: string;
};

function generateDates(from: string, to: string): string[] {
  const dates: string[] = [];
  const start = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return dates;
  const cur = new Date(start);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export default function Page() {
  const today = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [from, setFrom] = useState("TAS");
  const [flightClass, setFlightClass] = useState("Economy");

  const [domestic, setDomestic] = useState<{ code: string; name: string }[]>([]);
  const [showCodes, setShowCodes] = useState(false);

  useEffect(() => {
    fetch("/api/domestic")
      .then((r) => r.json())
      .then((j) => setDomestic(Array.isArray(j?.items) ? j.items : []))
      .catch(() => setDomestic([]));
  }, []);

  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<string | null>(null);
  const [data, setData] = useState<DailyResponse[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const dates = generateDates(dateFrom, dateTo);
    if (dates.length === 0) {
      setError("Noto'g'ri sana oralig'i.");
      return;
    }
    if (dates.length > 30) {
      setError("Sana oralig'i 30 kundan oshmasin.");
      return;
    }

    setLoading(true);
    setError(null);
    setData([]);

    const results: DailyResponse[] = [];
    try {
      for (let i = 0; i < dates.length; i++) {
        const d = dates[i];
        setLoadingProgress(`${d} yuklanmoqda... (${i + 1}/${dates.length})`);
        const url = new URL("/api/daily", window.location.origin);
        url.searchParams.set("date", d);
        url.searchParams.set("from", from.trim().toUpperCase());
        url.searchParams.set("class", flightClass);
        const res = await fetch(url.toString());
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error || "Request failed");
        results.push(j);
        setData([...results]);
      }
    } catch (e: any) {
      setError(e?.message || "Unknown error");
    } finally {
      setLoading(false);
      setLoadingProgress(null);
    }
  }

  function downloadXlsx() {
    const url = new URL("/api/export-xlsx", window.location.origin);
    url.searchParams.set("dateFrom", dateFrom);
    url.searchParams.set("dateTo", dateTo);
    url.searchParams.set("from", from.trim().toUpperCase());
    url.searchParams.set("class", flightClass);
    window.location.href = url.toString();
  }

  const grandTotal = data.reduce((s, d) => s + (d.total || 0), 0);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold">UzAir Daily Routes Dashboard (Domestic)</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Tanlangan sana oralig'i + shahar bo'yicha: ichki reyslarni hisoblab chiqadi (Excel formatda ham yuklab olish mumkin).
      </p>

      <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="text-xs font-medium text-neutral-700">From date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-neutral-700">To date</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-neutral-700">From (city/airport code)</label>
            <input
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
              placeholder="TAS"
            />
            <p className="mt-1 text-[11px] text-neutral-500">Masalan: TAS (Toshkent), SKD (Samarqand), AZN (Andijon)</p>
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowCodes((s) => !s)}
                className="text-xs underline text-neutral-600 hover:text-neutral-900"
              >
                {showCodes ? "Hide all city codes" : "Show all city codes"}
              </button>
              {showCodes && (
                <div className="mt-2 max-h-44 overflow-auto rounded-xl border border-neutral-200 bg-white p-3">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
                    {domestic.map((it) => (
                      <div key={it.code} className="text-xs text-neutral-800">
                        <span className="font-mono">{it.code}</span> — {it.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-neutral-700">Class</label>
            <select
              value={flightClass}
              onChange={(e) => setFlightClass(e.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
            >
              <option>Economy</option>
              <option>Business</option>
              <option>First</option>
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={run}
            className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={loading}
          >
            {loading ? (loadingProgress ?? "Running...") : "Generate summary"}
          </button>

          <button
            onClick={downloadXlsx}
            className="rounded-xl border border-neutral-200 px-4 py-2 text-sm disabled:opacity-50"
            disabled={loading}
          >
            Download Excel (.xlsx)
          </button>

          <button
            onClick={() => { setData([]); setError(null); }}
            className="rounded-xl px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
            disabled={loading}
          >
            Reset
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {data.length > 0 && data[0]?.note && (
          <p className="mt-3 text-xs text-neutral-500">{data[0].note}</p>
        )}
      </div>

      {data.length > 0 && (
        <div className="mt-4 text-sm text-neutral-600">
          Jami {data.length} kun | Umumiy reyslar:{" "}
          <span className="font-semibold text-neutral-900">{grandTotal}</span>
        </div>
      )}

      {data.length > 0 && (
        <div className="mt-3 space-y-4">
          {data.map((dayData) => (
            <DayCard key={dayData.date} dayData={dayData} />
          ))}
        </div>
      )}
    </main>
  );
}

function DayCard({ dayData }: { dayData: DailyResponse }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{dayData.date}</h2>
        <div className="text-xs text-neutral-500">
          {dayData.fromName}dan jami:{" "}
          <span className="font-medium text-neutral-900">{dayData.total}</span>{" "}
          | Yo'nalishlar:{" "}
          <span className="font-medium text-neutral-900">{dayData.routes.length}</span>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs text-neutral-500">
              <th className="border-b border-neutral-200 py-2 pr-3">Yo'nalish</th>
              <th className="border-b border-neutral-200 py-2 pr-3">Reyslar soni</th>
              <th className="border-b border-neutral-200 py-2 pr-3">Tranzit hududi</th>
              <th className="border-b border-neutral-200 py-2 pr-3">Tranzit soni</th>
              <th className="border-b border-neutral-200 py-2 pr-3">Samolyot</th>
              <th className="border-b border-neutral-200 py-2">Mavjud o'rindiq</th>
            </tr>
          </thead>
          <tbody>
            {dayData.routes.map((r) => (
              <tr key={`${r.from}-${r.to}`}>
                <td className="border-b border-neutral-100 py-2 pr-3">{`${r.fromName}-${r.toName}`}</td>
                <td className="border-b border-neutral-100 py-2 pr-3">{r.count}</td>
                <td className="border-b border-neutral-100 py-2 pr-3">{r.transitHubName ?? ""}</td>
                <td className="border-b border-neutral-100 py-2 pr-3">{r.transitCount ?? ""}</td>
                <td className="border-b border-neutral-100 py-2 pr-3 text-xs">{r.aircraftLabel ?? ""}</td>
                <td className="border-b border-neutral-100 py-2 text-center">{r.seatsAvailable ?? ""}</td>
              </tr>
            ))}
            {dayData.routes.length === 0 && (
              <tr>
                <td className="py-4 text-sm text-neutral-500" colSpan={4}>
                  Bu kunda ichki reys topilmadi.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
