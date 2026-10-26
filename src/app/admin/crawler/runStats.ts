/**
 * Helpers for the persisted crawler run history on /admin/crawler (spec 082).
 */
import type { ICrawlerBankSummary, ICrawlerRun } from "@/lib/models/crawlerRun.model";

export interface BankResultRow {
  bank: string;
  label: string;
  summary: ICrawlerBankSummary | undefined;
}

/** One row per known bank, in label order; banks absent from the run get `summary: undefined`. */
export function latestBankResults(
  run: Pick<ICrawlerRun, "summaries"> | null | undefined,
  labels: Record<string, string>,
): BankResultRow[] {
  return Object.entries(labels).map(([bank, label]) => ({
    bank,
    label,
    summary: run?.summaries.find((s) => s.bank === bank),
  }));
}

/** Map GitHub Actions run id → persisted run, for joining with the workflow-runs API. */
export function indexRunsByGithubId<T extends Pick<ICrawlerRun, "githubRunId">>(runs: T[]): Map<number, T> {
  const map = new Map<number, T>();
  for (const run of runs) {
    if (run.githubRunId !== undefined && run.githubRunId !== null && !map.has(run.githubRunId)) {
      map.set(run.githubRunId, run);
    }
  }
  return map;
}
