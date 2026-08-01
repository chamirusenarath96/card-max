import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db/connect";
import { AnnouncementModel } from "@/lib/models/announcement.model";

export async function GET() {
  try {
    await dbConnect();
    const announcement = await AnnouncementModel.findOne({ active: true })
      .sort({ createdAt: -1 })
      .lean();
    return NextResponse.json({ data: announcement ?? null });
  } catch {
    return NextResponse.json({ error: "Failed to fetch announcement" }, { status: 500 });
  }
}
