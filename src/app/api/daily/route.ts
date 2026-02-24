import { NextResponse } from "next/server";
import { computeDailyData } from "@/lib/daily-logic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = (searchParams.get("date") || "").trim();
  const from = (searchParams.get("from") || "TAS").trim().toUpperCase();
  const flightClass = (searchParams.get("class") || "Economy").trim();

  if (!date) {
    return NextResponse.json({ error: "Missing required query param: date (YYYY-MM-DD)" }, { status: 400 });
  }

  const result = await computeDailyData({ date, from, flightClass });
  return NextResponse.json(result);
}
