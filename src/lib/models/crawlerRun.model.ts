/**
 * CrawlerRun — one document per daily crawler run (spec 082)
 */
import mongoose, { Schema } from "mongoose";

export interface ICrawlerBankSummary {
  bank: string;
  status: "success" | "error";
  scraped?: number;
  inserted?: number;
  updated?: number;
  expired?: number;
  error?: string;
  durationMs?: number;
}

export interface ICrawlerRunFailure {
  bank: string;
  kind: string;
  detail: string;
}

export interface ICrawlerRunTotals {
  scraped: number;
  inserted: number;
  updated: number;
  expired: number;
  errors: number;
}

export interface ICrawlerRun {
  githubRunId?: number;
  githubRunNumber?: number;
  startedAt: Date;
  finishedAt: Date;
  summaries: ICrawlerBankSummary[];
  totals: ICrawlerRunTotals;
  failures: ICrawlerRunFailure[];
}

const BankSummarySchema = new Schema<ICrawlerBankSummary>(
  {
    bank: { type: String, required: true },
    status: { type: String, enum: ["success", "error"], required: true },
    scraped: Number,
    inserted: Number,
    updated: Number,
    expired: Number,
    error: String,
    durationMs: Number,
  },
  { _id: false },
);

const FailureSchema = new Schema<ICrawlerRunFailure>(
  {
    bank: { type: String, required: true },
    kind: { type: String, required: true },
    detail: { type: String, default: "" },
  },
  { _id: false },
);

const CrawlerRunSchema = new Schema<ICrawlerRun>(
  {
    githubRunId: { type: Number, default: undefined },
    githubRunNumber: { type: Number, default: undefined },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, required: true },
    summaries: { type: [BankSummarySchema], default: [] },
    totals: {
      scraped: { type: Number, default: 0 },
      inserted: { type: Number, default: 0 },
      updated: { type: Number, default: 0 },
      expired: { type: Number, default: 0 },
      errors: { type: Number, default: 0 },
    },
    failures: { type: [FailureSchema], default: [] },
  },
  { timestamps: true },
);

CrawlerRunSchema.index({ startedAt: -1 });
CrawlerRunSchema.index({ githubRunId: 1 });

export const CrawlerRunModel =
  (mongoose.models["CrawlerRun"] as mongoose.Model<ICrawlerRun>) ??
  mongoose.model<ICrawlerRun>("CrawlerRun", CrawlerRunSchema);
