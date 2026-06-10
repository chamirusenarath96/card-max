import { CheckCircle, XCircle, Clock, FlaskConical } from "lucide-react";
import { dbConnect } from "@/lib/db/connect";
import { OfferModel } from "@/lib/models/offer.model";

const REPO = "chamirusenarath96/card-max";
const GH_HEADERS: HeadersInit = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(process.env.GITHUB_FEEDBACK_TOKEN
    ? { Authorization: `Bearer ${process.env.GITHUB_FEEDBACK_TOKEN}` }
    : {}),
};

const BANK_LABELS: Record<string, string> = {
  commercial_bank:    "Commercial Bank",
  sampath_bank:       "Sampath Bank",
  hnb:                "HNB",
  nations_trust_bank: "Nations Trust Bank",
  amex_ntb:           "American Express",
  peoples_bank:       "People's Bank",
  bank_of_ceylon:     "Bank of Ceylon",
};

interface CiRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
  head_branch: string;
  head_sha: string;
  display_title: string;
  run_number: number;
}

interface JobStep {
  name: string;
  status: string;
  conclusion: string | null;
}

interface GitHubJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  steps: JobStep[];
}

interface TestCheck {
  label: string;
  conclusion: string | null;
  status: string;
}

interface TestSuiteResult {
  runNumber: number;
  runUrl: string;
  createdAt: string;
  overallConclusion: string | null;
  checks: TestCheck[];
}

interface BankStat { _id: string; lastScraped: Date; count: number }

interface BankStatusRow {
  bankKey: string;
  label: string;
  stat: BankStat | undefined;
  statusLabel: string;
  statusColor: string;
  lastScrapedStr: string;
}

async function fetchTestSuiteResults(): Promise<TestSuiteResult | null> {
  try {
    const runRes = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/ci.yml/runs?per_page=1&branch=master`,
      { headers: GH_HEADERS, cache: "no-store" },
    );
    if (!runRes.ok) return null;
    const runData = await runRes.json();
    const run: CiRun = runData.workflow_runs?.[0];
    if (!run) return null;

    const jobsRes = await fetch(
      `https://api.github.com/repos/${REPO}/actions/runs/${run.id}/jobs`,
      { headers: GH_HEADERS, cache: "no-store" },
    );
    if (!jobsRes.ok) return null;
    const jobsData = await jobsRes.json();
    const jobs: GitHubJob[] = jobsData.jobs ?? [];

    const ciJob  = jobs.find((j) => j.name === "Lint, Type Check & Test");
    const e2eJob = jobs.find((j) => j.name === "E2E Tests");

    const STEP_MAP: Record<string, string> = {
      "Lint":                   "Lint",
      "Type check":             "Type Check",
      "Unit & Component tests": "Unit Tests",
      "Build":                  "Build",
    };

    const ciChecks: TestCheck[] = ciJob
      ? Object.entries(STEP_MAP).map(([raw, label]) => {
          const step = ciJob.steps.find((s) => s.name === raw);
          return { label, conclusion: step?.conclusion ?? null, status: step?.status ?? "not_started" };
        })
      : [];

    return {
      runNumber:         run.run_number,
      runUrl:            run.html_url,
      createdAt:         run.created_at,
      overallConclusion: run.conclusion,
      checks: [
        ...ciChecks,
        { label: "E2E Tests", conclusion: e2eJob?.conclusion ?? null, status: e2eJob?.status ?? "not_started" },
      ],
    };
  } catch {
    return null;
  }
}

async function fetchCiHistory(): Promise<CiRun[]> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/ci.yml/runs?per_page=20&branch=master`,
      { headers: GH_HEADERS, cache: "no-store" },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.workflow_runs ?? []) as CiRun[];
  } catch {
    return [];
  }
}

async function fetchCrawlerRuns(): Promise<CiRun[]> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/crawler.yml/runs?per_page=14`,
      { headers: GH_HEADERS, cache: "no-store" },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.workflow_runs ?? []) as CiRun[];
  } catch {
    return [];
  }
}

async function fetchBankStatusRows(): Promise<BankStatusRow[]> {
  const stats = await OfferModel.aggregate<BankStat>([
    { $group: { _id: "$bank", lastScraped: { $max: "$scrapedAt" }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  const now = Date.now();
  return Object.entries(BANK_LABELS).map(([bankKey, label]) => {
    const stat = stats.find((s) => s._id === bankKey);
    const hoursAgo = stat ? (now - new Date(stat.lastScraped).getTime()) / 3_600_000 : Infinity;
    const statusLabel = hoursAgo < 26 ? "Today ✓" : hoursAgo < 50 ? "Yesterday" : "Stale";
    const statusColor =
      hoursAgo < 26
        ? "text-green-700 dark:text-green-400"
        : hoursAgo < 50
          ? "text-yellow-700 dark:text-yellow-400"
          : "text-red-700 dark:text-red-400";
    const lastScrapedStr = stat
      ? new Date(stat.lastScraped).toLocaleString("en-GB", {
          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
        })
      : "—";
    return { bankKey, label, stat, statusLabel, statusColor, lastScrapedStr };
  });
}


function CheckIcon({ conclusion, status }: { conclusion: string | null; status: string }) {
  if (status === "in_progress" || status === "queued")
    return <Clock className="h-4 w-4 text-yellow-500" />;
  if (conclusion === "success")
    return <CheckCircle className="h-4 w-4 text-green-500" />;
  if (conclusion === null)
    return <div className="h-4 w-4 rounded-full border-2 border-border" />;
  return <XCircle className="h-4 w-4 text-red-500" />;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  const m = Math.floor(diff / 60_000);
  return m > 0 ? `${m}m ago` : "just now";
}

export default async function CiRunsPage() {
  await dbConnect();
  const [testSuite, ciHistory, crawlerRuns, bankStatusRows] = await Promise.all([
    fetchTestSuiteResults(),
    fetchCiHistory(),
    fetchCrawlerRuns(),
    fetchBankStatusRows(),
  ]);

  const passed = testSuite?.checks.filter((c) => c.conclusion === "success").length ?? 0;
  const failed = testSuite?.checks.filter(
    (c) => c.conclusion !== null && c.conclusion !== "success" && c.conclusion !== "skipped",
  ).length ?? 0;

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <h1 className="mb-2 text-xl font-bold text-foreground md:text-2xl">CI Runs</h1>
      <p className="mb-6 text-sm text-muted-foreground">Test suite results and workflow history.</p>

      {/* ── Test Suite Results ─────────────────────────────────────────── */}
      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        {/* Latest run detail */}
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold text-foreground">
              <FlaskConical className="h-4 w-4 text-muted-foreground" />
              Test Suite
            </h2>
            {testSuite ? (
              <a
                href={testSuite.runUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                Run #{testSuite.runNumber} · {timeAgo(testSuite.createdAt)} →
              </a>
            ) : null}
          </div>

          {!testSuite ? (
            <p className="text-sm text-muted-foreground">No CI data available.</p>
          ) : (
            <>
              <ul className="space-y-3">
                {testSuite.checks.map((check) => (
                  <li key={check.label} className="flex items-center gap-3 text-sm">
                    <CheckIcon conclusion={check.conclusion} status={check.status} />
                    <span className="flex-1 font-medium text-foreground">{check.label}</span>
                    <span
                      className={`text-xs font-medium ${
                        check.conclusion === "success"
                          ? "text-green-600 dark:text-green-400"
                          : check.status === "in_progress" || check.status === "queued"
                            ? "text-yellow-600 dark:text-yellow-400"
                            : check.conclusion === null
                              ? "text-muted-foreground"
                              : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {check.status === "in_progress"
                        ? "running"
                        : check.status === "queued"
                          ? "queued"
                          : check.conclusion ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>

              <div
                className={`mt-4 rounded-lg px-3 py-2 text-xs font-medium ${
                  testSuite.overallConclusion === "success"
                    ? "bg-green-500/10 text-green-700 dark:text-green-400"
                    : testSuite.overallConclusion === null
                      ? "bg-muted text-muted-foreground"
                      : "bg-red-500/10 text-red-700 dark:text-red-400"
                }`}
              >
                {testSuite.overallConclusion === "success"
                  ? "✓ All checks passed"
                  : testSuite.overallConclusion === null
                    ? "⏳ In progress…"
                    : "✗ One or more checks failed"}
              </div>
            </>
          )}
        </section>

        {/* Pass / Fail summary cards */}
        <div className="grid grid-rows-2 gap-4">
          <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle className="h-6 w-6 text-green-500" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Checks Passed</p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">{passed}</p>
              <p className="text-xs text-muted-foreground">out of {testSuite?.checks.length ?? 0} total</p>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-500/10">
              <XCircle className="h-6 w-6 text-red-500" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Checks Failed</p>
              <p className="text-3xl font-bold text-red-600 dark:text-red-400">{failed}</p>
              <p className="text-xs text-muted-foreground">latest master run</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── CI / Deploy history ─────────────────────────────────────────── */}
      <section className="mb-8 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 font-semibold text-foreground">
          CI / Deploy History — Last {ciHistory.length} Master Runs
        </h2>
        {ciHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs found.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {ciHistory.map((run) => (
              <a
                key={run.id}
                href={run.html_url}
                target="_blank"
                rel="noopener noreferrer"
                title={`#${run.run_number} — ${new Date(run.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} — ${run.conclusion ?? run.status}`}
                className={`flex h-9 w-9 items-center justify-center rounded-lg border text-xs font-bold transition-opacity hover:opacity-80 ${
                  run.conclusion === "success"
                    ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400"
                    : run.status === "in_progress" || run.status === "queued"
                      ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
                      : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
                }`}
              >
                {run.conclusion === "success" ? "✓" : run.status === "in_progress" ? "…" : "✗"}
              </a>
            ))}
          </div>
        )}
        {ciHistory.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Each box = one deploy. Hover for date. Click to open in GitHub.
          </p>
        )}
      </section>

      {/* ── Per-bank crawler status ─────────────────────────────────── */}
      <section className="mb-8 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 font-semibold text-foreground">Bank Crawler Status</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-6 font-medium">Bank</th>
                <th className="pb-2 pr-6 font-medium">Last Scraped</th>
                <th className="pb-2 pr-6 font-medium">Status</th>
                <th className="pb-2 font-medium">Offers in DB</th>
              </tr>
            </thead>
            <tbody>
              {bankStatusRows.map(({ bankKey, label, stat, statusLabel, statusColor, lastScrapedStr }) => (
                <tr key={bankKey} className="border-b border-border/50">
                  <td className="py-2.5 pr-6 font-medium text-foreground">{label}</td>
                  <td className="py-2.5 pr-6 text-muted-foreground">{lastScrapedStr}</td>
                  <td className={`py-2.5 pr-6 font-medium ${statusColor}`}>{statusLabel}</td>
                  <td className="py-2.5 text-muted-foreground">{stat?.count ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Daily Crawler history ───────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 font-semibold text-foreground">
          Daily Crawler — Last {crawlerRuns.length} Runs
        </h2>
        {crawlerRuns.length === 0 ? (
          <p className="text-sm text-muted-foreground">No crawler runs found.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {crawlerRuns.map((run) => (
              <a
                key={run.id}
                href={run.html_url}
                target="_blank"
                rel="noopener noreferrer"
                title={`#${run.run_number} — ${new Date(run.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} — ${run.conclusion ?? run.status}`}
                className={`flex h-9 w-9 items-center justify-center rounded-lg border text-xs font-bold transition-opacity hover:opacity-80 ${
                  run.conclusion === "success"
                    ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400"
                    : run.status === "in_progress" || run.status === "queued"
                      ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
                      : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
                }`}
              >
                {run.conclusion === "success" ? "✓" : run.status === "in_progress" ? "…" : "✗"}
              </a>
            ))}
          </div>
        )}
        {crawlerRuns.length > 0 && (
          <>
            <p className="mt-3 text-xs text-muted-foreground">
              Each box = one day. Hover for date. Click to open in GitHub.
            </p>
            <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
              <span>
                <span className="font-medium text-green-600 dark:text-green-400">
                  {crawlerRuns.filter((r) => r.conclusion === "success").length}
                </span>{" "}
                passed
              </span>
              <span>
                <span className="font-medium text-red-600 dark:text-red-400">
                  {crawlerRuns.filter(
                    (r) => r.conclusion !== null && r.conclusion !== "success" && r.conclusion !== "cancelled",
                  ).length}
                </span>{" "}
                failed
              </span>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
