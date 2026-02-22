import { NextResponse } from "next/server";
import {
  fetchAirportDirectory,
  fetchDomesticAirportCodes,
  fallbackUzDomesticCodes,
  getAirportNameFromMap,
  postFlights,
} from "@/lib/aerotur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function variantSignature(v: any): string {
  // Create a stable key based on segments (flight numbers + times + airports).
  // This de-duplicates "same itinerary" returned multiple times by supplier/markup differences.
  const segs = v?.legs?.[0]?.segments;
  if (!Array.isArray(segs) || segs.length === 0) {
    return String(v?.flight_uuid || v?.flight_id || v?.ident || "");
  }
  const parts = segs.map((s: any) => {
    const fn = s?.flight_number_full || s?.flight_number || "";
    const dep = s?.departure_airport || "";
    const arr = s?.arrival_airport || "";
    const dt = s?.departure_date_time || s?.departureDateTime || "";
    const at = s?.arrival_date_time || s?.arrivalDateTime || "";
    return [fn, dep, arr, dt, at].join("|");
  });
  return parts.join(">>");
}

function uniqBySignature(items: any[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const it of items) {
    const sig = variantSignature(it);
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(it);
  }
  return out;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = (searchParams.get("date") || "").trim(); // YYYY-MM-DD
  const from = (searchParams.get("from") || "TAS").trim().toUpperCase();
  const flightClass = (searchParams.get("class") || "Economy").trim();

  if (!date) {
    return NextResponse.json({ error: "Missing required query param: date (YYYY-MM-DD)" }, { status: 400 });
  }

  // Airport directory so we can translate transit hubs (DME/VKO) into city names.
  const airportDirectory = await fetchAirportDirectory();

  // Domestic codes from API (best effort), otherwise fallback
  const apiCodes = await fetchDomesticAirportCodes();
  const domestic = (apiCodes && apiCodes.length ? apiCodes : fallbackUzDomesticCodes())
    .map((c) => c.toUpperCase())
    .filter((c) => c !== from);

  const routes: any[] = [];
  let fromName = from;

  // Sequential requests to avoid rate limits
  for (const to of domestic) {
    try {
      const j = await postFlights({ from, to, date, flightClass, isDirect: false });
      const variantsRaw: any[] = Array.isArray(j?.variants) ? j.variants : [];
      const variants: any[] = uniqBySignature(variantsRaw);
      const airportsFromResponse = j?.airports;

      if (!variants.length) continue;

      // Names from this response (covers from/to)
      if (airportsFromResponse) {
        fromName = getAirportNameFromMap(airportsFromResponse, from);
      }
      const toName = airportsFromResponse ? getAirportNameFromMap(airportsFromResponse, to) : to;

      // DIRECT variants = legs[0].segments.length === 1
      const directVariants = variants.filter((v) => {
        const segs = v?.legs?.[0]?.segments;
        return Array.isArray(segs) && segs.length === 1;
      });
      const directCount = directVariants.length;

      // TRANSIT variants (do NOT add to direct count)
      const transitVariants = variants.filter((v) => {
        const segs = v?.legs?.[0]?.segments;
        return Array.isArray(segs) && segs.length >= 2;
      });
      const transitCount = transitVariants.length;

      // Only count direct flights. If no direct flights exist, skip this route entirely.
      const count = directCount;

      if (count === 0) continue;

      // Find most common first hub among transit variants
      const hubCounts: Record<string, number> = {};
      for (const v of transitVariants) {
        const segs = v?.legs?.[0]?.segments || [];
        const hubCode = segs?.[0]?.arrival_airport;
        if (hubCode) hubCounts[hubCode] = (hubCounts[hubCode] || 0) + 1;
      }

      let transitHubCode: string | undefined;
      let transitHubName: string | undefined;
      const hubEntries = Object.entries(hubCounts).sort((a, b) => b[1] - a[1]);
      if (hubEntries.length) {
        transitHubCode = hubEntries[0][0];

        if (airportDirectory && airportDirectory[transitHubCode]) {
          transitHubName = getAirportNameFromMap(airportDirectory, transitHubCode);
        } else if (airportsFromResponse && airportsFromResponse[transitHubCode]) {
          transitHubName = getAirportNameFromMap(airportsFromResponse, transitHubCode);
        } else {
          transitHubName = transitHubCode;
        }
      }

      routes.push({
        from,
        to,
        fromName,
        toName,
        count,
        transitHubCode,
        transitHubName,
        transitCount,
      });
    } catch {
      continue;
    }
  }

  // Sort by count
  routes.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));

  const total = routes.reduce((s, r) => s + (r.count || 0), 0);

  return NextResponse.json({
    date,
    flightClass,
    from,
    fromName,
    total,
    routes,
    note:
      "Reyslar soni = direct count (segments=1) only. Routes with no direct flights are excluded. Transit variants are de-duplicated by itinerary signature.",
  });
}
