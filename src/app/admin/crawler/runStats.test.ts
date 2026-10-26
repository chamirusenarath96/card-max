/**
 * Spec: specs/features/082-crawler-run-history.md (TC5, TC6)
 */
import { describe, it, expect } from "vitest";
import { latestBankResults, indexRunsByGithubId } from "./runStats";

const LABELS = { commercial_bank: "Commercial Bank", sampath_bank: "Sampath Bank", hnb: "HNB" };

describe("latestBankResults", () => {
  it("returns one row per bank in label order, with missing banks undefined", () => {
    const rows = latestBankResults(
      {
        summaries: [
          { bank: "hnb", status: "success", scraped: 18 },
          { bank: "commercial_bank", status: "error", error: "timeout" },
        ],
      },
      LABELS,
    );
    expect(rows.map((r) => r.bank)).toEqual(["commercial_bank", "sampath_bank", "hnb"]);
    expect(rows[0]!.summary?.status).toBe("error");
    expect(rows[1]!.summary).toBeUndefined();
    expect(rows[2]!.summary?.scraped).toBe(18);
    expect(rows[2]!.label).toBe("HNB");
  });

  it("returns rows with no summaries when no run has been persisted", () => {
    const rows = latestBankResults(null, LABELS);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.summary === undefined)).toBe(true);
  });
});

describe("indexRunsByGithubId", () => {
  it("maps GitHub run id to the record, skipping local runs and keeping the first duplicate", () => {
    const a = { githubRunId: 1, tag: "a" };
    const b = { githubRunId: 2, tag: "b" };
    const local = { githubRunId: undefined, tag: "local" };
    const dup = { githubRunId: 1, tag: "dup" };
    const map = indexRunsByGithubId([a, b, local, dup]);
    expect(map.size).toBe(2);
    expect(map.get(1)).toBe(a);
    expect(map.get(2)).toBe(b);
  });
});
