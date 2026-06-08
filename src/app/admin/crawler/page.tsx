import { dbConnect } from "@/lib/db/connect";
import { OfferModel } from "@/lib/models/offer.model";
import { CheckCircle, XCircle, Clock } from "lucide-react";
import { OffersTrendChart, type DailyPoint } from "./OffersTrendChart";

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

const ALL_BANKS = Object.keys(BANK_LABELS);

interface CrawlerRun {
  id: number;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
  run_number: number;
}

async function fetchCrawlerRuns(): Promise<CrawlerRun[]> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/crawler.yml/runs?per_page=30`,
      { headers: GH_HEADERS, cache: "no-store" },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.workflow_runs ?? [];
  } catch {
    return [];
  }
}

interface RawDailyRow { date: string; bank: string; count: number }

async function fetchDailyOfferCounts(): Promise<RawDailyRow[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await OfferModel.aggregate<RawDailyRow>([
    { $match: { createdAt: { $gte: thirtyDaysAgo } } },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          bank: "$bank",
        },
        count: { $sum: 1 },
      },
    },
    { $project: { _id: 0, date: "$_id.date", bank: "$_id.bank", count: 1 } },
    { $sort: { date: 1 } },
  ]);
  return rows;
}

function buildChartData(rows: RawDailyRow[]): DailyPoint[] {
  const dateMap = new Map<string, DailyPoint>();
  for (const row of rows) {
    if (!dateMap.has(row.date)) {
      const label = new Date(row.date + "T00:00:00Z").toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        timeZone: "UTC",
      });
      dateMap.set(row.date, { date: label });
    }
    const point = dateMap.get(row.date)!;
    point[row.bank] = (point[row.bank] as number | undefined ?? 0) + row.count;
  }
  return Array.from(dateMap.values());
}

function duration(created: string, updated: string) {
  const ms = new Date(updated).getTime() - new Date(created).getTime();
  const min = Math.floor(ms / 60_000);
  const sec = Math.floor((ms % 60_000) / 1_000);
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
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

export default async function CrawlerPage() {
  await dbConnect();
  const [crawlerRuns, dailyRows] = await Promise.all([
    fetchCrawlerRuns(),
    fetchDailyOfferCounts(),
  ]);

  const chartData = buildChartData(dailyRows);
  const banksInData = ALL_BANKS.filter((b) =>
    dailyRows.some((r) => r.bank === b)
  );

  const successCount = crawlerRuns.filter((r) => r.conclusion === "success").length;
  const failCount = crawlerRuns.filter(
    (r) => r.conclusion !== null && r.conclusion !== "success" && r.conclusion !== "cancelled" && r.conclusion !== "skipped"
  ).length;
  const successRate = crawlerRuns.length > 0
    ? Math.round((successCount / crawlerRuns.length) * 100)
    : null;

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <h1 className="mb-2 text-xl font-bold text-foreground md:text-2xl">Crawler</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Daily scrape history and new offers added per bank.
      </p>

      {/* ── Summary stats ──────────────────────────────────────────── */}
      <div className="mb-8 grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Success Rate</p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {successRate !== null ? `${successRate}%` : "—"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{crawlerRuns.length} runs</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Passed</p>
          <p className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">
            {successCount}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">last 30 runs</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Failed</p>
          <p className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">{failCount}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">last 30 runs</p>
        </div>
      </div>

      {/* ── New offers per day chart ────────────────────────────────── */}
      <section className="mb-8 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 font-semibold text-foreground">New Offers Added per Day</h2>
        <OffersTrendChart data={chartData} banks={banksInData} />
      </section>

      {/* ── Run history table ───────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold text-foreground">Run History</h2>
        </div>
        {crawlerRuns.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">No crawler runs found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-5 py-3 font-medium">#</th>
                  <th className="px-5 py-3 font-medium">Result</th>
                  <th className="hidden px-5 py-3 font-medium sm:table-cell">Duration</th>
                  <th className="px-5 py-3 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {crawlerRuns.map((run) => (
                  <tr key={run.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-5 py-3 text-muted-foreground">
                      <a href={run.html_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        #{run.run_number}
                      </a>
                    </td>
                    <td className="px-5 py-3">
                      {run.status === "in_progress" || run.status === "queued" ? (
                        <span className="flex items-center gap-1.5 text-yellow-600 dark:text-yellow-400">
                          <Clock className="h-3.5 w-3.5" /> running
                        </span>
                      ) : run.conclusion === "success" ? (
                        <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                          <CheckCircle className="h-3.5 w-3.5" /> success
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                          <XCircle className="h-3.5 w-3.5" /> {run.conclusion ?? "failed"}
                        </span>
                      )}
                    </td>
                    <td className="hidden px-5 py-3 text-muted-foreground sm:table-cell">
                      {duration(run.created_at, run.updated_at)}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {timeAgo(run.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
