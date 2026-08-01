import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../../auth";
import { dbConnect } from "@/lib/db/connect";
import { AnnouncementModel, AnnouncementInputSchema } from "@/lib/models/announcement.model";

const AnnouncementPatchSchema = AnnouncementInputSchema.partial();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body: unknown = await request.json();
    const parsed = AnnouncementPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    await dbConnect();

    if (parsed.data.active === true) {
      await AnnouncementModel.updateMany({ _id: { $ne: id }, active: true }, { active: false });
    }

    const announcement = await AnnouncementModel.findByIdAndUpdate(id, parsed.data, {
      new: true,
    });
    if (!announcement) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: announcement });
  } catch {
    return NextResponse.json({ error: "Failed to update announcement" }, { status: 500 });
  }
}
