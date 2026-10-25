import { getDb } from "@/db";
import { approvedOrderLines } from "@/lib/decisions";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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
