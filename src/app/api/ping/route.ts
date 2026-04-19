/**
 * GET /api/ping
 * Lightweight warmup endpoint — opens a MongoDB connection and returns { ok: true }.
 * Called by the warmup cron every 5 minutes to prevent cold-start latency spikes.
 */
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db/connect";

export async function GET() {
  try {
    await dbConnect();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
