import mongoose, { Schema } from "mongoose";

export type FeedbackType = "suggestion" | "bug" | "other";
export type FeedbackStatus = "new" | "converted";

export interface IFeedback {
  _id: string;
  type: FeedbackType;
  message: string;
  email?: string;
  status: FeedbackStatus;
  githubIssueUrl?: string;
  githubIssueNumber?: number;
  createdAt: Date;
  updatedAt: Date;
}

const FeedbackSchema = new Schema<IFeedback>(
  {
    type: { type: String, enum: ["suggestion", "bug", "other"], required: true },
    message: { type: String, required: true, maxlength: 1000 },
    email: { type: String, default: undefined },
    status: { type: String, enum: ["new", "converted"], default: "new" },
    githubIssueUrl: { type: String, default: undefined },
    githubIssueNumber: { type: Number, default: undefined },
  },
  { timestamps: true },
);

FeedbackSchema.index({ createdAt: -1 });

export const FeedbackModel =
  (mongoose.models["Feedback"] as mongoose.Model<IFeedback>) ??
  mongoose.model<IFeedback>("Feedback", FeedbackSchema);
