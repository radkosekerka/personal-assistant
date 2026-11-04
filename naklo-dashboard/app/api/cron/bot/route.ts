import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runBot } from "@/lib/bot/run";

export const dynamic = "force-dynamic";

/** Ranní běh bota. Vercel Cron posílá hlavičku Authorization: Bearer $CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  if (!secret || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runBot("cron"));
}
