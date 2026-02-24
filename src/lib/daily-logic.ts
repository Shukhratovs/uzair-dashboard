import {
  fetchAirportDirectory,
  fetchDomesticAirportCodes,
  fallbackUzDomesticCodes,
  getAirportNameFromMap,
  postFlights,
  AIRCRAFT_NAME_MAP,
  AIRCRAFT_CAPACITY_MAP,
  DailyResponse,
} from "@/lib/aerotur";

function variantSignature(v: any): string {
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

export async function computeDailyData(params: {
  date: string;
  from: string;
  flightClass: string;
}): Promise<DailyResponse> {
  const { date, from, flightClass } = params;

  const airportDirectory = await fetchAirportDirectory();
  const apiCodes = await fetchDomesticAirportCodes();
  const domestic = (apiCodes && apiCodes.length ? apiCodes : fallbackUzDomesticCodes())
    .map((c) => c.toUpperCase())
    .filter((c) => c !== from);

  const routes: any[] = [];
  let fromName = from;

  for (const to of domestic) {
    try {
      const j = await postFlights({ from, to, date, flightClass, isDirect: false });
      const variantsRaw: any[] = Array.isArray(j?.variants) ? j.variants : [];
      const variants: any[] = uniqBySignature(variantsRaw);
      const airportsFromResponse = j?.airports;

      if (!variants.length) continue;

      if (airportsFromResponse) {
        fromName = getAirportNameFromMap(airportsFromResponse, from);
      }
      const toName = airportsFromResponse ? getAirportNameFromMap(airportsFromResponse, to) : to;

      const directVariants = variants.filter((v) => {
        const segs = v?.legs?.[0]?.segments;
        return Array.isArray(segs) && segs.length === 1;
      });
      const directCount = directVariants.length;

      const transitVariants = variants.filter((v) => {
        const segs = v?.legs?.[0]?.segments;
        return Array.isArray(segs) && segs.length >= 2;
      });
      const transitCount = transitVariants.length;

      const count = directCount > 0 ? directCount : transitCount;
      if (count === 0) continue;

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

      const UZ_DOMESTIC = new Set(["TAS","SKD","BHK","AZN","FEG","NMA","UGC","TMJ","KSQ","NVI","NCU"]);
      if (directCount === 0 && transitHubCode && !UZ_DOMESTIC.has(transitHubCode)) continue;

      const relevantVariants = directCount > 0 ? directVariants : transitVariants;
      const aircraftCodes = [
        ...new Set(
          relevantVariants
            .map((v) => v?.legs?.[0]?.segments?.[0]?.aircraft_type as string | undefined)
            .filter((c): c is string => !!c)
        ),
      ];
      const seatsAvailable = relevantVariants.reduce(
        (sum, v) => sum + (typeof v?.seats === "number" ? v.seats : 0),
        0
      );
      const aircraftLabel = aircraftCodes
        .map((code) => {
          const name = AIRCRAFT_NAME_MAP[code] ?? `Aircraft ${code}`;
          const cap = AIRCRAFT_CAPACITY_MAP[code];
          return cap ? `${name} (~${cap} o'rindiq)` : name;
        })
        .join(", ");

      routes.push({
        from,
        to,
        fromName,
        toName,
        count,
        transitHubCode,
        transitHubName,
        transitCount,
        aircraftCodes,
        seatsAvailable,
        aircraftLabel,
      });
    } catch {
      continue;
    }
  }

  routes.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  const total = routes.reduce((s, r) => s + (r.count || 0), 0);

  return {
    date,
    flightClass,
    from,
    fromName,
    total,
    routes,
    note: "Reyslar soni = directCount if direct flights exist, else transitCount. Transit hub shown when route is transit-only. Variants de-duplicated by itinerary signature.",
  };
}
