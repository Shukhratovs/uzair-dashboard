import { NextResponse } from "next/server";
import {
  fetchAirportDirectory,
  fetchDomesticAirportCodes,
  fallbackUzDomesticCodes,
  getAirportNameFromMap,
} from "@/lib/aerotur";
import { UZ_CITY_MAP } from "@/lib/aerotur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const airportDirectory = await fetchAirportDirectory();
  const apiCodes = await fetchDomesticAirportCodes();
  const codes = (apiCodes && apiCodes.length ? apiCodes : fallbackUzDomesticCodes())
    .map((c) => c.toUpperCase())
    .sort();

  const items = codes.map((code) => {
    const name =
      UZ_CITY_MAP[code] ||
      (airportDirectory && airportDirectory[code]
        ? getAirportNameFromMap(airportDirectory, code)
        : code);
    return { code, name };
  });

  return NextResponse.json({ items, total: items.length });
}
