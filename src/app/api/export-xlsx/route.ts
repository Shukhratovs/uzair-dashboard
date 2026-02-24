import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DailyResponse = {
  date: string;
  flightClass: string;
  from: string;
  fromName: string;
  total: number;
  routes: {
    from: string;
    to: string;
    fromName: string;
    toName: string;
    count: number;
    transitHubCode?: string;
    transitHubName?: string;
    transitCount?: number;
    aircraftLabel?: string;
  }[];
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
  // Support both old ?date= and new ?dateFrom=&dateTo=
  const dateFrom = (searchParams.get("dateFrom") || searchParams.get("date") || "").trim();
  const dateTo = (searchParams.get("dateTo") || dateFrom).trim();
  const from = (searchParams.get("from") || "TAS").trim().toUpperCase();
  const flightClass = (searchParams.get("class") || "Economy").trim();

  if (!dateFrom) {
    return NextResponse.json({ error: "Missing required query param: dateFrom" }, { status: 400 });
  }

  const dates = generateDates(dateFrom, dateTo);
  if (dates.length === 0) {
    return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  }
  if (dates.length > 30) {
    return NextResponse.json({ error: "Date range cannot exceed 30 days." }, { status: 400 });
  }

  const origin = new URL(req.url).origin;
  const dailyResults: DailyResponse[] = [];

  for (const date of dates) {
    const dailyUrl = new URL("/api/daily", origin);
    dailyUrl.searchParams.set("date", date);
    dailyUrl.searchParams.set("from", from);
    dailyUrl.searchParams.set("class", flightClass);
    const dailyRes = await fetch(dailyUrl.toString());
    if (dailyRes.ok) {
      dailyResults.push((await dailyRes.json()) as DailyResponse);
    }
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Aviarayslar");

  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 14;
  ws.getColumn(3).width = 22;
  ws.getColumn(4).width = 14;
  ws.getColumn(5).width = 28;

  // Column headers
  ws.mergeCells("A3:A4");
  ws.mergeCells("B3:B4");
  ws.mergeCells("C3:D3");
  ws.mergeCells("E3:E4");

  ws.getCell("A3").value = "Yo'nalish";
  ws.getCell("B3").value = "Reyslar soni";
  ws.getCell("C3").value = "Tranzit yo'nalishlar";
  ws.getCell("C4").value = "Tranzit hududi";
  ws.getCell("D4").value = "Tranzit soni";
  ws.getCell("E3").value = "Samolyot";

  ["A3", "B3", "C3", "C4", "D4", "E3"].forEach((a) => headerCell(ws.getCell(a)));

  // Grand total row
  const grandTotal = dailyResults.reduce((s, d) => s + d.total, 0);
  const rangeLabel =
    dateFrom === dateTo
      ? formatUzDate(dateFrom)
      : `${formatUzDate(dateFrom)} – ${formatUzDate(dateTo)}`;
  ws.getCell("A5").value = `${rangeLabel} jami`;
  ws.getCell("B5").value = grandTotal;
  cellBox(ws.getCell("A5"), { bold: true });
  cellBox(ws.getCell("B5"), { bold: true, center: true });

  let r = 6;
  for (const daily of dailyResults) {
    // Day header (blue)
    ws.mergeCells(`A${r}:B${r}`);
    ws.getCell(`A${r}`).value = `Tanlangan kun: ${formatUzDate(daily.date)}`;
    blueCell(ws.getCell(`A${r}`));
    blueCell(ws.getCell(`B${r}`));
    r++;

    // Origin + day total
    ws.getCell(`A${r}`).value = `${daily.fromName}dan`;
    ws.getCell(`B${r}`).value = daily.total;
    cellBox(ws.getCell(`A${r}`), { bold: true });
    cellBox(ws.getCell(`B${r}`), { bold: true, center: true });
    r++;

    for (const row of daily.routes) {
      ws.getCell(`A${r}`).value = `${row.fromName}-${row.toName}`;
      ws.getCell(`B${r}`).value = row.count;
      cellBox(ws.getCell(`A${r}`));
      cellBox(ws.getCell(`B${r}`), { center: true });

      if (row.transitHubName && row.transitCount) {
        ws.getCell(`C${r}`).value = row.transitHubName;
        ws.getCell(`D${r}`).value = row.transitCount;
      }
      cellBox(ws.getCell(`C${r}`));
      cellBox(ws.getCell(`D${r}`), { center: true });

      if (row.aircraftLabel) {
        ws.getCell(`E${r}`).value = row.aircraftLabel;
      }
      cellBox(ws.getCell(`E${r}`));

      r++;
    }

    r++; // blank row between days
  }

  const buffer = await wb.xlsx.writeBuffer();
  const fileName =
    dateFrom === dateTo
      ? `aviarayslar_${dateFrom}.xlsx`
      : `aviarayslar_${dateFrom}_${dateTo}.xlsx`;

  return new NextResponse(buffer as any, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
