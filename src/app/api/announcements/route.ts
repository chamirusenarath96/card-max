import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { dbConnect } from "@/lib/db/connect";
import { AnnouncementModel, AnnouncementInputSchema } from "@/lib/models/announcement.model";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await dbConnect();
    const items = await AnnouncementModel.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json({ data: items });
  } catch {
    return NextResponse.json({ error: "Failed to fetch announcements" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body: unknown = await request.json();
    const parsed = AnnouncementInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    await dbConnect();

    if (parsed.data.active) {
      await AnnouncementModel.updateMany({ active: true }, { active: false });
    }

    const announcement = await AnnouncementModel.create(parsed.data);
    return NextResponse.json({ success: true, data: announcement }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create announcement" }, { status: 500 });
  }
}
