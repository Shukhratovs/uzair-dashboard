export type AirportMap = Record<string, any>;

export type DailyRouteRow = {
  from: string;
  to: string;
  fromName: string;
  toName: string;
  // DIRECT flights count only
  count: number;
  // Most common transit hub for this route (if any)
  transitHubCode?: string;
  transitHubName?: string;
  transitCount?: number;
  // Aircraft info
  aircraftCodes?: string[];   // IATA aircraft type codes e.g. ["320"]
  seatsAvailable?: number;    // sum of remaining bookable seats across flights
  aircraftLabel?: string;     // human-readable e.g. "Airbus A320 (~150 o'rindiq)"
};

// IATA aircraft type code → full display name
export const AIRCRAFT_NAME_MAP: Record<string, string> = {
  "320": "Airbus A320",
  "321": "Airbus A321",
  "32A": "Airbus A320",
  "32B": "Airbus A321",
  "32N": "Airbus A320neo",
  "32Q": "Airbus A321neo",
  "763": "Boeing 767-300",
  "764": "Boeing 767-400",
  "788": "Boeing 787-8",
  "789": "Boeing 787-9",
  "310": "Airbus A310",
  "333": "Airbus A330-300",
};

// Approximate total seat capacity per aircraft type (UzAirways config)
export const AIRCRAFT_CAPACITY_MAP: Record<string, number> = {
  "320": 150,
  "321": 180,
  "32A": 150,
  "32B": 180,
  "32N": 165,
  "32Q": 182,
  "763": 240,
  "764": 245,
  "788": 270,
  "789": 294,
  "310": 200,
  "333": 277,
};

export const UZ_CITY_MAP: Record<string, string> = {
  TAS: "Toshkent",
  SKD: "Samarqand",
  AZN: "Andijon",
  NMA: "Namangan",
  FEG: "Farg‘ona",
  NCU: "Nukus",
  UGC: "Urganch",
  TMJ: "Termiz",
  KSQ: "Qarshi",
  BHK: "Buxoro",
  NVI: "Navoiy",
};

export type DailyResponse = {
  date: string;
  flightClass: string;
  from: string;
  fromName: string;
  total: number; // total DIRECT flights out of origin for that day
  routes: DailyRouteRow[];
  note?: string;
};

const AEROTUR_BASE = "https://api.aerotur.aero";
const DEFAULT_INSTANCE = "uzairways.online.dev";
const DEFAULT_LOCALE = "UZ";

function pickLocaleName(names: any[] | undefined, locale: string): string | undefined {
  if (!Array.isArray(names)) return undefined;
  const found = names.find((n) => (n?.locale || n?.Locale) === locale);
  return found?.value || found?.Value || found?.name || found?.Name;
}

export function airportToUzName(airportObj: any, fallbackCode: string): string {
  // Prefer city name in Uzbek if available
  const city = airportObj?.city;
  const n = pickLocaleName(city?.names, "UZ") || airportObj?.name;
  return n || fallbackCode;
}

export function getAirportNameFromMap(airports: AirportMap | undefined, code: string): string {
  if (!airports || !airports[code]) return code;
  return airportToUzName(airports[code], code);
}

export async function postFlights(params: {
  from: string;
  to: string;
  date: string;
  flightClass: string;
  instance?: string;
  locale?: string;
  isDirect?: boolean;
}) {
  const body = {
    locale: params.locale ?? DEFAULT_LOCALE,
    instance: params.instance ?? DEFAULT_INSTANCE,
    adults: 1,
    children: 0,
    infants: 0,
    infants_seat: 0,
    asGrouped: 0,
    aroundDates: 0,
    flight_class: params.flightClass,
    from: params.from,
    to: params.to,
    fromType: "city",
    toType: "city",
    date1: params.date,
    date2: null,
    isDirect: params.isDirect ?? false,
  };

  const res = await fetch(`${AEROTUR_BASE}/api/flights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Aerotur /api/flights failed ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

async function tryJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchDomesticAirportCodes(): Promise<string[] | null> {
  // Best-effort: try a few likely endpoints used by Aerotur-like frontends.
  const instance = DEFAULT_INSTANCE;
  const locale = DEFAULT_LOCALE;
  const candidates = [
    `${AEROTUR_BASE}/api/airports?instance=${encodeURIComponent(instance)}&locale=${encodeURIComponent(locale)}`,
    `${AEROTUR_BASE}/api/airports/list?instance=${encodeURIComponent(instance)}&locale=${encodeURIComponent(locale)}`,
    `${AEROTUR_BASE}/api/cities?instance=${encodeURIComponent(instance)}&locale=${encodeURIComponent(locale)}`,
    `${AEROTUR_BASE}/api/locations?instance=${encodeURIComponent(instance)}&locale=${encodeURIComponent(locale)}`,
  ];

  for (const url of candidates) {
    const j = await tryJson(url);
    if (!j) continue;

    // Try to extract codes that look like IATA and belong to UZ
    const codes: string[] = [];
    const visit = (obj: any) => {
      if (!obj) return;
      if (Array.isArray(obj)) {
        obj.forEach(visit);
        return;
      }
      if (typeof obj === "object") {
        const code = obj.code || obj.iata || obj.airport_code || obj.city_code;
        const country = obj.country?.code || obj.country_code || obj.countryCode;
        const isActive = obj.is_active ?? obj.isActive ?? true;
        if (typeof code === "string" && /^[A-Z0-9]{3}$/.test(code) && isActive && (!country || country === "UZ")) {
          codes.push(code);
        }
        Object.values(obj).forEach(visit);
      }
    };
    visit(j);

    const uniq = Array.from(new Set(codes));
    if (uniq.length >= 6) return uniq;
  }

  return null;
}

export async function fetchAirportDirectory(): Promise<AirportMap | null> {
  // Goal: map code -> object with city names, so we can translate hubs (DME, VKO, etc.) to city names.
  // We try a few endpoints and normalize into a dictionary.
  const instance = DEFAULT_INSTANCE;
  const locale = DEFAULT_LOCALE;

  const candidates = [
    `${AEROTUR_BASE}/api/airports?instance=${encodeURIComponent(instance)}&locale=${encodeURIComponent(locale)}`,
    `${AEROTUR_BASE}/api/airports/list?instance=${encodeURIComponent(instance)}&locale=${encodeURIComponent(locale)}`,
  ];

  for (const url of candidates) {
    const j = await tryJson(url);
    if (!j) continue;

    const out: AirportMap = {};

    // If already a dict keyed by code, use it
    if (j && typeof j === "object" && !Array.isArray(j)) {
      // common patterns: { airports: {...} } or direct {...}
      const dict = (j.airports && typeof j.airports === "object") ? j.airports : j;
      if (dict && typeof dict === "object" && !Array.isArray(dict)) {
        for (const [k, v] of Object.entries(dict)) {
          if (/^[A-Z0-9]{3}$/.test(k)) out[k] = v;
        }
      }
    }

    // Or list of airports
    const visit = (obj: any) => {
      if (!obj) return;
      if (Array.isArray(obj)) {
        obj.forEach(visit);
        return;
      }
      if (typeof obj === "object") {
        const code = obj.code || obj.iata || obj.airport_code;
        if (typeof code === "string" && /^[A-Z0-9]{3}$/.test(code)) {
          out[code] = obj;
        }
        Object.values(obj).forEach(visit);
      }
    };
    visit(j);

    if (Object.keys(out).length >= 20) return out;
  }
  return null;
}

export function fallbackUzDomesticCodes(): string[] {
  // Fallback list of common Uzbekistan city/airport codes used on uzairways.online (IATA/city codes)
  return [
    "TAS", // Toshkent
    "SKD", // Samarqand
    "BHK", // Buxoro
    "AZN", // Andijon
    "FEG", // Farg'ona
    "NMA", // Namangan
    "UGC", // Urganch
    "TMJ", // Termiz
    "KSQ", // Qarshi
    "NVI", // Navoiy
    "NCU", // Nukus
  ];
}
