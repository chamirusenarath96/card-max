/**
 * Crawler per-bank failure detection and deduplicated GitHub issue reporting
 * Spec: specs/features/052-crawler-failure-monitoring.md
 */
export interface RunSummary {
  bank: string;
  status: "success" | "error";
  scraped?: number;
  inserted?: number;
  updated?: number;
  expired?: number;
  error?: string;
  durationMs?: number;
}

export const EXPECTED_BANKS = [
  "commercial_bank",
  "sampath_bank",
  "hnb",
  "nations_trust_bank",
  "amex_ntb",
  "peoples_bank",
  "bank_of_ceylon",
] as const;

export interface BankFailure {
  bank: string;
  kind: "error" | "zero_offers" | "missing_from_run";
  detail: string;
}

export function detectFailures(
  summaries: RunSummary[],
  previousActiveCounts: Record<string, number>
): BankFailure[] {
  const failures: BankFailure[] = [];
  const seenBanks = new Set(summaries.map((s) => s.bank));

  for (const bank of EXPECTED_BANKS) {
    if (!seenBanks.has(bank)) {
      failures.push({ bank, kind: "missing_from_run", detail: "absent from this run's SCRAPERS results" });
    }
  }

  for (const s of summaries) {
    if (s.status === "error") {
      failures.push({ bank: s.bank, kind: "error", detail: s.error ?? "unknown error" });
    } else if (s.scraped === 0 && (previousActiveCounts[s.bank] ?? 0) > 0) {
      failures.push({
        bank: s.bank,
        kind: "zero_offers",
        detail: `returned 0 offers; had ${previousActiveCounts[s.bank]} active offer(s) before this run`,
      });
    }
  }

  return failures;
}

const TITLES: Record<BankFailure["kind"], (bank: string) => string> = {
  error: (bank) => `crawler: ${bank} scraper failed`,
  zero_offers: (bank) => `crawler: ${bank} scraper returned 0 offers`,
  missing_from_run: (bank) => `crawler: ${bank} scraper is missing from the run`,
};

async function hasOpenIssue(
  token: string,
  owner: string,
  repo: string,
  title: string
): Promise<boolean> {
  const query = `repo:${owner}/${repo}+is:issue+is:open+in:title+"${title}"`;
  const res = await fetch(`https://api.github.com/search/issues?q=${query}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!res.ok) {
    throw new Error(`GitHub search API returned ${res.status}`);
  }

  const data = (await res.json()) as { total_count: number };
  return data.total_count > 0;
}

async function createIssue(
  token: string,
  owner: string,
  repo: string,
  title: string,
  failure: BankFailure
): Promise<void> {
  const runUrl =
    process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null;

  const body = [
    `**Bank:** ${failure.bank}`,
    `**Failure kind:** ${failure.kind}`,
    `**Detail:** ${failure.detail}`,
    `**Detected:** ${new Date().toISOString()}`,
    runUrl ? `**Workflow run:** ${runUrl}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ title, body, labels: ["bug", "crawler"] }),
  });

  if (!res.ok) {
    throw new Error(`GitHub issues API returned ${res.status}`);
  }
}

/**
 * Advisory — never throws. A GitHub API failure is logged and the remaining
 * failures are still processed, so it never affects the crawler's exit code.
 */
export async function reportFailures(failures: BankFailure[]): Promise<void> {
  const token = process.env.GITHUB_FEEDBACK_TOKEN;
  const owner = process.env.GITHUB_REPO_OWNER ?? "chamirusenarath96";
  const repo = process.env.GITHUB_REPO_NAME ?? "card-max";
  if (!token) {
    console.warn("[failureAlerts] GITHUB_FEEDBACK_TOKEN not set — skipping failure reporting");
    return;
  }

  for (const failure of failures) {
    const title = TITLES[failure.kind](failure.bank);
    try {
      const alreadyOpen = await hasOpenIssue(token, owner, repo, title);
      if (alreadyOpen) {
        console.log(`[failureAlerts] Open issue already exists for "${title}" — skipping`);
        continue;
      }
      await createIssue(token, owner, repo, title, failure);
      console.log(`[failureAlerts] Created issue: ${title}`);
    } catch (err) {
      console.warn(`[failureAlerts] Failed to report "${title}":`, err);
    }
  }
}
