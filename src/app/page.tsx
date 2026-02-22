"use client";

import { useEffect, useMemo, useState } from "react";

type DailyRow = {
  from: string;
  to: string;
  fromName: string;
  toName: string;
  count: number;
  transitHubCode?: string;
      transitHubName?: string;
  transitCount?: number;
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

export default function Page() {
  const [date, setDate] = useState("2026-02-23");
  
  const [domestic, setDomestic] = useState<{ code: string; name: string }[]>([]);
  const [showCodes, setShowCodes] = useState(false);
  const [from, setFrom] = useState("TAS");
  const [flightClass, setFlightClass] = useState("Economy");
  
  useEffect(() => {
    fetch("/api/domestic")
      .then((r) => r.json())
      .then((j) => setDomestic(Array.isArray(j?.items) ? j.items : []))
      .catch(() => setDomestic([]));
  }, []);
const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DailyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalRoutes = useMemo(() => data?.routes?.length ?? 0, [data]);

  async function run() {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const url = new URL("/api/daily", window.location.origin);
      url.searchParams.set("date", date);
      url.searchParams.set("from", from.trim().toUpperCase());
      url.searchParams.set("class", flightClass);

      const res = await fetch(url.toString());
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Request failed");
      setData(j);
    } catch (e: any) {
      setError(e?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function downloadXlsx() {
    const url = new URL("/api/export-xlsx", window.location.origin);
    url.searchParams.set("date", date);
    url.searchParams.set("from", from.trim().toUpperCase());
    url.searchParams.set("class", flightClass);
    window.location.href = url.toString();
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold">UzAir Daily Routes Dashboard (Domestic)</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Tanlangan kun + tanlangan shahar bo‘yicha: shu kunda nechta ichki reys borligini hisoblaydi (Excel formatda ham yuklab
        olish mumkin).
      </p>

      <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="text-xs font-medium text-neutral-700">Date</label>
            <input
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
              placeholder="YYYY-MM-DD"
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
            {loading ? "Running..." : "Generate daily summary"}
          </button>

          <button
            onClick={downloadXlsx}
            className="rounded-xl border border-neutral-200 px-4 py-2 text-sm disabled:opacity-50"
            disabled={loading}
          >
            Download Excel (.xlsx)
          </button>

          <button
            onClick={() => {
              setData(null);
              setError(null);
            }}
            className="rounded-xl px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
            disabled={loading}
          >
            Reset
          </button>
        </div>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        {data?.note ? <p className="mt-3 text-xs text-neutral-500">{data.note}</p> : null}
      </div>

      {data ? (
        <div className="mt-6 grid grid-cols-1 gap-4">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Natija</h2>
              <div className="text-xs text-neutral-500">
                {data.fromName}dan jami: <span className="font-medium text-neutral-900">{data.total}</span> | Yo‘nalishlar:{" "}
                <span className="font-medium text-neutral-900">{totalRoutes}</span>
              </div>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs text-neutral-500">
                    <th className="border-b border-neutral-200 py-2 pr-3">Yo‘nalish</th>
                    <th className="border-b border-neutral-200 py-2 pr-3">Reyslar soni</th>
                    <th className="border-b border-neutral-200 py-2 pr-3">Tranzit hududi</th>
                    <th className="border-b border-neutral-200 py-2">Tranzit soni</th>
                  </tr>
                </thead>
                <tbody>
                  {data.routes.map((r) => (
                    <tr key={`${r.from}-${r.to}`}>
                      <td className="border-b border-neutral-100 py-2 pr-3">{`${r.fromName}-${r.toName}`}</td>
                      <td className="border-b border-neutral-100 py-2 pr-3">{r.count}</td>
                      <td className="border-b border-neutral-100 py-2 pr-3">{r.transitHubName ?? ""}</td>
                      <td className="border-b border-neutral-100 py-2">{r.transitCount ?? ""}</td>
                    </tr>
                  ))}
                  {data.routes.length === 0 ? (
                    <tr>
                      <td className="py-4 text-sm text-neutral-500" colSpan={4}>
                        Hech narsa topilmadi (bu kunda ichki reys bo‘lmasligi mumkin).
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}