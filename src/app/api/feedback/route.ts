import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "../../../../auth";
import { dbConnect } from "@/lib/db/connect";
import { FeedbackModel } from "@/lib/models/feedback.model";

const FeedbackInputSchema = z.object({
  type: z.enum(["suggestion", "bug", "other"]),
  message: z.string().min(10, "Message must be at least 10 characters").max(1000),
  email: z.string().email().optional().or(z.literal("")),
});

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const parsed = FeedbackInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { type, message, email } = parsed.data;
    await dbConnect();
    const feedback = await FeedbackModel.create({
      type,
      message,
      email: email || undefined,
    });

    return NextResponse.json({ success: true, id: feedback._id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
  }
}

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();
    const items = await FeedbackModel.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json({ data: items });
  } catch {
    return NextResponse.json({ error: "Failed to fetch feedback" }, { status: 500 });
  }
}
