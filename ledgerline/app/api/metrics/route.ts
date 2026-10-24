import { NextResponse } from "next/server";
import { getMetrics, type Range } from "@/lib/data";

export const dynamic = "force-dynamic";

const RANGES: Range[] = ["7d", "30d", "90d"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requested = searchParams.get("range") as Range | null;
  const range = requested && RANGES.includes(requested) ? requested : "30d";

  return NextResponse.json(getMetrics(range), {
    headers: { "Cache-Control": "no-store" },
  });
}
