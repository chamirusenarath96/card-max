import mongoose, { Schema } from "mongoose";
import { z } from "zod";

export const AnnouncementInputSchema = z.object({
  message: z.string().min(1).max(280),
  linkUrl: z.string().url().optional(),
  linkLabel: z.string().max(40).optional(),
  active: z.boolean().optional().default(false),
});

export type AnnouncementInput = z.infer<typeof AnnouncementInputSchema>;

export interface IAnnouncement {
  _id: string;
  message: string;
  linkUrl?: string;
  linkLabel?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AnnouncementSchema = new Schema<IAnnouncement>(
  {
    message: { type: String, required: true, maxlength: 280 },
    linkUrl: { type: String, default: undefined },
    linkLabel: { type: String, default: undefined, maxlength: 40 },
    active: { type: Boolean, default: false },
  },
  { timestamps: true },
);

AnnouncementSchema.index({ active: 1, createdAt: -1 });

export const AnnouncementModel =
  (mongoose.models["Announcement"] as mongoose.Model<IAnnouncement>) ??
  mongoose.model<IAnnouncement>("Announcement", AnnouncementSchema);
