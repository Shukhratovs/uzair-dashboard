import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FlightClass = "Economy" | "Business" | "First";

function buildPayload(params: {
  from: string;
  to: string;
  date1: string; // YYYY-MM-DD
  flight_class: FlightClass;
  locale?: string;
  instance?: string;
}) {
  return {
    adults: 1,
    children: 0,
    infants: 0,
    infants_seat: 0,
    aroundDates: 0,
    asGrouped: 0,
    date1: params.date1,
    date2: null,
    flight_class: params.flight_class,
    from: params.from,
    fromType: "city",
    to: params.to,
    toType: "city",
    instance: params.instance ?? "uzairways.online.dev",
    locale: params.locale ?? "UZ",
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const from = (searchParams.get("from") || "").trim().toUpperCase();
  const to = (searchParams.get("to") || "").trim().toUpperCase();
  const date1 = (searchParams.get("date") || "").trim();
  const flight_class = (searchParams.get("class") || "Economy") as FlightClass;

  if (!from || !to || !date1) {
    return NextResponse.json(
      { error: "Missing required query params: from, to, date" },
      { status: 400 }
    );
  }

  const payload = buildPayload({ from, to, date1, flight_class });

  try {
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
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "Non-JSON response from provider", raw: text },
        { status: 502 }
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Fetch failed", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
