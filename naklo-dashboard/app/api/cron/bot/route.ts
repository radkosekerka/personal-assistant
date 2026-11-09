import { NextResponse } from "next/server";
import { runBot } from "@/lib/bot/run";
import { cronAuthorized } from "@/lib/cron";

export const dynamic = "force-dynamic";

/** Ranní běh bota. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await runBot("cron"));
}
