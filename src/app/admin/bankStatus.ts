/**
 * Overview "Bank Crawler Status" aggregation (spec 082 AC5).
 * `count` only includes active offers; `lastScraped` is taken over every
 * offer so a bank whose offers all expired still shows when it last ran.
 */
import type { PipelineStage } from "mongoose";

export function bankStatusPipeline(): PipelineStage[] {
  return [
    {
      $group: {
        _id: "$bank",
        lastScraped: { $max: "$scrapedAt" },
        count: { $sum: { $cond: [{ $eq: ["$isExpired", false] }, 1, 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ];
}
