import { timingSafeEqual } from "node:crypto";

/** Cron (Vercel Cron / Cloud Scheduler) posílá hlavičku Authorization: Bearer $CRON_SECRET. */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  return !!secret && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}
