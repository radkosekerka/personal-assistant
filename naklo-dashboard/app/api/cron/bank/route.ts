import { NextResponse } from "next/server";
import { syncAllBanks } from "@/lib/bank/sync";
import { cronAuthorized } from "@/lib/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Stažení zůstatků a pohybů ze všech aktivních propojení s bankou. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const results = await syncAllBanks("cron");
  return NextResponse.json({ results });
}
