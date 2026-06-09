import { dbConnect } from "@/lib/db/connect";
import { FeedbackModel } from "@/lib/models/feedback.model";
import { OfferModel } from "@/lib/models/offer.model";
import { CheckCircle, XCircle, Clock, MessageSquare, GitBranch, Rocket, Database, FlaskConical } from "lucide-react";
import Link from "next/link";

const REPO = "chamirusenarath96/card-max";
const GH_HEADERS: HeadersInit = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(process.env.GITHUB_FEEDBACK_TOKEN
    ? { Authorization: `Bearer ${process.env.GITHUB_FEEDBACK_TOKEN}` }
    : {}),
};

const BANK_LABELS: Record<string, string> = {
  commercial_bank:   "Commercial Bank",
  sampath_bank:      "Sampath Bank",
  hnb:               "HNB",
  nations_trust_bank:"Nations Trust Bank",
  amex_ntb:          "American Express",
  peoples_bank:      "People's Bank",
  bank_of_ceylon:    "Bank of Ceylon",
};

interface CiRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  html_url: string;
  head_branch: string;
  run_number: number;
}

interface JobStep {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
}

interface GitHubJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  steps: JobStep[];
}

interface TestSuiteResult {
  runNumber: number;
  runUrl: string;
  createdAt: string;
  overallConclusion: string | null;
  checks: { label: string; conclusion: string | null; status: string }[];
}

interface BankStat { _id: string; lastScraped: Date; count: number }

interface BankStatusItem {
  bankKey: string;
  label: string;
  stat: BankStat | undefined;
  status: "ok" | "warn" | "fail";
}

async function fetchRecentRuns(): Promise<CiRun[] | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/ci.yml/runs?per_page=20`,
      { headers: GH_HEADERS, cache: "no-store" },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.workflow_runs as CiRun[];
  } catch {
    return null;
  }
}

async function fetchLatestDeployment() {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/deployments?per_page=1&environment=Production`,
      { headers: GH_HEADERS, cache: "no-store" },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchTestSuiteResults(): Promise<TestSuiteResult | null> {
  try {
    // Latest master run
    const runRes = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/ci.yml/runs?per_page=1&branch=master`,
      { headers: GH_HEADERS, cache: "no-store" },
    );
    if (!runRes.ok) return null;
    const runData = await runRes.json();
    const run: CiRun = runData.workflow_runs?.[0];
    if (!run) return null;

    // Jobs + steps for that run
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
      "Lint":                    "Lint",
      "Type check":              "Type Check",
      "Unit & Component tests":  "Unit Tests",
      "Build":                   "Build",
    };

    const ciChecks = ciJob
      ? Object.entries(STEP_MAP).map(([raw, label]) => {
          const step = ciJob.steps.find((s) => s.name === raw);
          return {
            label,
            conclusion: step?.conclusion ?? null,
            status:     step?.status     ?? "not_started",
          };
        })
      : [];

    const e2eCheck = {
      label:      "E2E Tests",
      conclusion: e2eJob?.conclusion ?? null,
      status:     e2eJob?.status     ?? "not_started",
    };

    return {
      runNumber:         run.run_number,
      runUrl:            run.html_url,
      createdAt:         run.created_at,
      overallConclusion: run.conclusion,
      checks:            [...ciChecks, e2eCheck],
    };
  } catch {
    return null;
  }
}

async function fetchBankStatusMap(): Promise<BankStatusItem[]> {
  const stats = await OfferModel.aggregate<BankStat>([
    { $group: { _id: "$bank", lastScraped: { $max: "$scrapedAt" }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  const now = Date.now();
  return Object.entries(BANK_LABELS).map(([bankKey, label]) => {
    const stat = stats.find((s) => s._id === bankKey);
    const hoursAgo = stat ? (now - new Date(stat.lastScraped).getTime()) / 3_600_000 : Infinity;
    const status: "ok" | "warn" | "fail" = hoursAgo < 26 ? "ok" : hoursAgo < 50 ? "warn" : "fail";
    return { bankKey, label, stat, status };
  });
}

function StepIcon({ conclusion, status }: { conclusion: string | null; status: string }) {
  if (status === "in_progress" || status === "queued")
    return <Clock className="h-4 w-4 text-yellow-500" />;
  if (conclusion === "success")
    return <CheckCircle className="h-4 w-4 text-green-500" />;
  if (conclusion === null)
    return <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />;
  return <XCircle className="h-4 w-4 text-red-500" />;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  return "just now";
}

export default async function AdminOverviewPage() {
  const [runs, deployment, testSuite] = await Promise.all([
    fetchRecentRuns(),
    fetchLatestDeployment(),
    fetchTestSuiteResults(),
  ]);

  await dbConnect();
  const [totalFeedback, newFeedback, recentFeedback, bankStatusMap] = await Promise.all([
    FeedbackModel.countDocuments(),
    FeedbackModel.countDocuments({ status: "new" }),
    FeedbackModel.find().sort({ createdAt: -1 }).limit(5).lean(),
    fetchBankStatusMap(),
  ]);

  const ciRuns = runs ?? [];
  const masterRuns = ciRuns.filter((r) => r.head_branch === "master");
  const successCount = masterRuns.filter((r) => r.conclusion === "success").length;
  const successRate = masterRuns.length > 0
    ? Math.round((successCount / masterRuns.length) * 100)
    : null;

  const lastSuccessfulDeploy = masterRuns.find((r) => r.conclusion === "success");

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <h1 className="mb-6 text-xl font-bold text-foreground md:text-2xl">Overview</h1>

      {/* Stats row */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="CI Success Rate"
          value={successRate !== null ? `${successRate}%` : "—"}
          sub={`${masterRuns.length} runs`}
          icon={<CheckCircle className="h-5 w-5 text-green-500" />}
        />
        <StatCard
          label="Last Deploy"
          value={lastSuccessfulDeploy ? timeAgo(lastSuccessfulDeploy.created_at) : "—"}
          sub={deployment?.environment ?? "Production"}
          icon={<Rocket className="h-5 w-5 text-primary" />}
        />
        <StatCard
          label="New Feedback"
          value={String(newFeedback)}
          sub={`${totalFeedback} total`}
          icon={<MessageSquare className="h-5 w-5 text-blue-500" />}
        />
        <StatCard
          label="Branch"
          value="master"
          sub="main branch"
          icon={<GitBranch className="h-5 w-5 text-muted-foreground" />}
        />
      </div>

      {/* Bank Crawler Status */}
      <section className="mb-6 rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold text-foreground">
            <Database className="h-4 w-4 text-muted-foreground" />
            Bank Crawler Status
          </h2>
          <Link href="/admin/ci" className="text-xs text-primary hover:underline">
            Crawler history →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {bankStatusMap.map(({ bankKey, label, stat, status }) => (
            <div key={bankKey} className="flex flex-col items-center rounded-lg border border-border bg-muted/30 p-3 text-center">
              <span
                className={`mb-1.5 h-2.5 w-2.5 rounded-full ${
                  status === "ok" ? "bg-green-500" : status === "warn" ? "bg-yellow-500" : "bg-red-500"
                }`}
              />
              <p className="text-[11px] font-medium leading-tight text-foreground">{label}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {stat ? timeAgo(new Date(stat.lastScraped).toISOString()) : "never"}
              </p>
              <p className="text-[10px] text-muted-foreground">{stat?.count ?? 0} offers</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Test Suite Results */}
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
            ) : (
              <Link href="/admin/ci" className="text-xs text-primary hover:underline">
                View CI →
              </Link>
            )}
          </div>
          {!testSuite ? (
            <p className="text-sm text-muted-foreground">No CI data available.</p>
          ) : (
            <ul className="space-y-2.5">
              {testSuite.checks.map((check) => (
                <li key={check.label} className="flex items-center gap-3 text-sm">
                  <StepIcon conclusion={check.conclusion} status={check.status} />
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
          )}
          {testSuite && (
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
          )}
        </section>

        {/* Recent feedback */}
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Recent Feedback</h2>
            <Link href="/admin/feedback" className="text-xs text-primary hover:underline">
              View all →
            </Link>
          </div>
          {recentFeedback.length === 0 ? (
            <p className="text-sm text-muted-foreground">No feedback yet.</p>
          ) : (
            <ul className="space-y-3">
              {recentFeedback.map((item) => (
                <li key={item._id.toString()} className="text-sm">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                      {item.type}
                    </span>
                    {item.status === "converted" && (
                      <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:text-green-400">
                        converted
                      </span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-muted-foreground">{item.message}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {icon}
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
