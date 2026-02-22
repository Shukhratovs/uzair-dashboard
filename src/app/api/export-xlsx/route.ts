import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DailyResponse = {
  date: string;
  flightClass: string;
  from: string;
  fromName: string;
  total: number; // DIRECT total
  routes: {
    from: string;
    to: string;
    fromName: string;
    toName: string;
    count: number; // DIRECT count for that route
    transitHubCode?: string;
    transitHubName?: string;
    transitCount?: number;
  }[];
  note?: string;
};

function headerCell(cell: ExcelJS.Cell) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDEAD1" } };
  cell.font = { bold: true };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
}

function blueCell(cell: ExcelJS.Cell) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E7F7" } };
  cell.font = { bold: true };
  cell.alignment = { vertical: "middle", horizontal: "center" };
  cell.border = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
}

function cellBox(cell: ExcelJS.Cell, opts?: { bold?: boolean; center?: boolean }) {
  cell.font = { bold: !!opts?.bold };
  cell.alignment = { vertical: "middle", horizontal: opts?.center ? "center" : "left" };
  cell.border = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
}

function formatUzDate(dateIso: string) {
  const [y, m, d] = dateIso.split("-");
  return `${d}.${m}.${y}`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = (searchParams.get("date") || "").trim();
  const from = (searchParams.get("from") || "TAS").trim().toUpperCase();
  const flightClass = (searchParams.get("class") || "Economy").trim();

  if (!date) {
    return NextResponse.json({ error: "Missing required query param: date (YYYY-MM-DD)" }, { status: 400 });
  }

  const origin = new URL(req.url).origin;
  const dailyUrl = new URL("/api/daily", origin);
  dailyUrl.searchParams.set("date", date);
  dailyUrl.searchParams.set("from", from);
  dailyUrl.searchParams.set("class", flightClass);

  const dailyRes = await fetch(dailyUrl.toString());
  if (!dailyRes.ok) {
    const j = await dailyRes.json().catch(() => ({}));
    return NextResponse.json({ error: "Daily fetch failed", detail: j }, { status: 500 });
  }
  const daily = (await dailyRes.json()) as DailyResponse;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Aviarayslar");

  ws.getColumn(1).width = 30; // A
  ws.getColumn(2).width = 14; // B
  ws.getColumn(3).width = 22; // C
  ws.getColumn(4).width = 14; // D

  // Header area like your template
  ws.mergeCells("A3:A4");
  ws.mergeCells("B3:B4");
  ws.mergeCells("C3:D3");

  ws.getCell("A3").value = "Yo‘nalish";
  ws.getCell("B3").value = "Reyslar soni";
  ws.getCell("C3").value = "Tranzit yo‘nalishlar";
  ws.getCell("C4").value = "Tranzit hududi";
  ws.getCell("D4").value = "Tranzit soni";

  ["A3", "B3", "C3", "C4", "D4"].forEach((a) => headerCell(ws.getCell(a)));

  // Total DIRECT flights for that day (kept in the same cell label)
  ws.getCell("A5").value = "1 hafta mobaynida jami";
  ws.getCell("B5").value = daily.total;
  cellBox(ws.getCell("A5"), { bold: true });
  cellBox(ws.getCell("B5"), { bold: true, center: true });

  // Day row
  ws.mergeCells("A6:B6");
  ws.getCell("A6").value = `Tanlangan kun: ${formatUzDate(daily.date)}`;
  blueCell(ws.getCell("A6"));
  blueCell(ws.getCell("B6"));

  // Origin header
  ws.getCell("A7").value = `${daily.fromName}dan`;
  ws.getCell("B7").value = daily.total;
  cellBox(ws.getCell("A7"), { bold: true });
  cellBox(ws.getCell("B7"), { bold: true, center: true });

  let r = 8;
  for (const row of daily.routes) {
    ws.getCell(`A${r}`).value = `${row.fromName}-${row.toName}`;
    ws.getCell(`B${r}`).value = row.count; // DIRECT count only
    cellBox(ws.getCell(`A${r}`));
    cellBox(ws.getCell(`B${r}`), { center: true });

    if (row.transitHubName && row.transitCount) {
      ws.getCell(`C${r}`).value = row.transitHubName; // city name if available
      ws.getCell(`D${r}`).value = row.transitCount;
    }
    cellBox(ws.getCell(`C${r}`));
    cellBox(ws.getCell(`D${r}`), { center: true });

    r += 1;
  }

  const buffer = await wb.xlsx.writeBuffer();

  return new NextResponse(buffer as any, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="aviarayslar_${date}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
