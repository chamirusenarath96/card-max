/**
 * GET /api/health
 * Basic health check — used by monitoring and CI smoke tests
 */
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/lib/db/connect";

export async function GET() {
  try {
    await dbConnect();
    const dbStatus =
      mongoose.connection.readyState === 1 ? "connected" : "disconnected";

    return NextResponse.json({ status: "ok", db: dbStatus });
  } catch {
    return NextResponse.json(
      { status: "error", db: "disconnected" },
      { status: 503 }
    );
  }
}
