import { getDb } from "@/db";
import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { approvedOrderLines } from "@/lib/decisions";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req, "viewer");
  if (g instanceof NextResponse) return g;
  const runId = Number((await params).id);
  if (!Number.isInteger(runId)) return new Response("Bad run id", { status: 400 });
  const lines = await approvedOrderLines(await getDb(), runId);
  const csv = lines.length ? toCsv(lines) : "No approved lines yet\n";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="freshroots_reorder_run${runId}.csv"`,
    },
  });
}
