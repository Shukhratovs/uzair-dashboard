import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FlightClass = "Economy" | "Business" | "First";

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

function extractTransitHubs(variant: any): string[] {
  const legs = variant?.legs ?? [];
  const hubs: string[] = [];
  for (const leg of legs) {
    const segs = leg?.segments ?? [];
    if (segs.length <= 1) continue;
    // hubs are the arrival_airport of all segments except the last
    for (let i = 0; i < segs.length - 1; i++) {
      const hub = (segs[i]?.arrival_airport || "").toString().trim();
      if (hub) hubs.push(hub);
    }
  }
  return hubs;
}

async function fetchFlights(params: {
  from: string;
  to: string;
  date: string;
  flightClass: FlightClass;
}) {
  const payload = {
    adults: 1,
    children: 0,
    infants: 0,
    infants_seat: 0,
    aroundDates: 0,
    asGrouped: 0,
    date1: params.date,
    date2: null,
    flight_class: params.flightClass,
    from: params.from,
    fromType: "city",
    to: params.to,
    toType: "city",
    instance: "uzairways.online.dev",
    locale: "UZ",
  };

  const r = await fetch("https://api.aerotur.aero/api/flights", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      origin: "https://uzairways.online",
      referer: "https://uzairways.online/",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari",
    },
    body: JSON.stringify(payload),
  });

  const text = await r.text();
  return JSON.parse(text);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const start = (searchParams.get("start") || "").trim(); // YYYY-MM-DD
  const flightClass = (searchParams.get("class") || "Economy") as FlightClass;

  // Default domestic list (you can replace with an autocomplete endpoint later)
  const originsParam = (searchParams.get("origins") || "TAS").trim();
  const destinationsParam = (searchParams.get("destinations") || "").trim();

  const origins = originsParam.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);

  const defaultDomestic = ["TAS","AZN","BHK","FEG","NMA","SKD","TMJ","UGC","KSQ","NVI"]; 
  // NOTE: this list is a starter. Replace/extend after you capture the official autocomplete endpoint.

  const destinations = (destinationsParam ? destinationsParam.split(",") : defaultDomestic)
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);

  if (!start) {
    return NextResponse.json(
      { error: "Missing required query param: start (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  const routes: Record<string, number> = {};
  const transit: Record<string, number> = {};
  const byDay: Record<string, { routes: Record<string, number> }> = {};

  // polite throttling
  const DELAY_MS = 400;

  for (const day of days) {
    byDay[day] = { routes: {} };

    for (const from of origins) {
      for (const to of destinations) {
        if (from === to) continue;

        const key = `${from}-${to}`;
        try {
          const data = await fetchFlights({ from, to, date: day, flightClass });
          const variants = Array.isArray(data?.variants) ? data.variants : [];
          const directVariants = variants.filter((v: any) => {
            const segs = v?.legs?.[0]?.segments;
            return Array.isArray(segs) && segs.length === 1;
          });
          const transitVariantsWeekly = variants.filter((v: any) => {
            const segs = v?.legs?.[0]?.segments;
            return Array.isArray(segs) && segs.length >= 2;
          });

          // If transit-only, check that the top hub is a domestic UZ airport (skip international hubs)
          const UZ_DOMESTIC_W = new Set(["TAS","SKD","BHK","AZN","FEG","NMA","UGC","TMJ","KSQ","NVI","NCU"]);
          let useTransit = transitVariantsWeekly.length > 0;
          if (directVariants.length === 0 && useTransit) {
            const hubCounts: Record<string, number> = {};
            for (const v of transitVariantsWeekly) {
              const hub = v?.legs?.[0]?.segments?.[0]?.arrival_airport;
              if (hub) hubCounts[hub] = (hubCounts[hub] || 0) + 1;
            }
            const topHub = Object.entries(hubCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
            if (topHub && !UZ_DOMESTIC_W.has(topHub)) useTransit = false;
          }

          // Direct flights take priority. If none, fall back to transit count (domestic hubs only).
          const count = directVariants.length > 0 ? directVariants.length : (useTransit ? transitVariantsWeekly.length : 0);

          if (count > 0) {
            routes[key] = (routes[key] || 0) + count;
            byDay[day].routes[key] = (byDay[day].routes[key] || 0) + count;

            for (const v of variants) {
              const hubs = extractTransitHubs(v);
              for (const h of hubs) {
                transit[h] = (transit[h] || 0) + 1;
              }
            }
          }
        } catch (e) {
          // ignore individual failures but keep running
        }

        await sleep(DELAY_MS);
      }
    }
  }

  const topTransit = Object.entries(transit)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([hub, count]) => ({ hub, count }));

  return NextResponse.json({
    start,
    days,
    flightClass,
    origins,
    destinations,
    totals: {
      routes,
      topTransit,
    },
    byDay,
    note:
      "This uses a starter domestic code list. For full accuracy, capture the uzairways.online autocomplete/cities endpoint and replace defaultDomestic.",
  });
}
