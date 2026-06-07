import { CheckCircle, XCircle, Clock, SkipForward } from "lucide-react";
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

interface BankStat { _id: string; lastScraped: Date; count: number }

async function fetchRuns(): Promise<CiRun[]> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/actions/runs?per_page=50`,
      { headers: GH_HEADERS, cache: "no-store" },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.workflow_runs ?? [];
  } catch {
    return [];
  }
}

function conclusionBadge(conclusion: string | null, status: string) {
  if (status === "in_progress")
    return (
      <span className="flex items-center gap-1 rounded-full bg-yellow-500/10 px-2.5 py-0.5 text-xs font-medium text-yellow-700 dark:text-yellow-400">
        <Clock className="h-3 w-3" /> running
      </span>
    );
  if (status === "queued")
    return (
      <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
        <Clock className="h-3 w-3" /> queued
      </span>
    );
  if (conclusion === "success")
    return (
      <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
        <CheckCircle className="h-3 w-3" /> success
      </span>
    );
  if (conclusion === "skipped" || conclusion === "cancelled")
    return (
      <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
        <SkipForward className="h-3 w-3" /> {conclusion}
      </span>
    );
  return (
    <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
      <XCircle className="h-3 w-3" /> {conclusion ?? "failed"}
    </span>
  );
}

function duration(created: string, updated: string) {
  const ms = new Date(updated).getTime() - new Date(created).getTime();
  const min = Math.floor(ms / 60_000);
  const sec = Math.floor((ms % 60_000) / 1_000);
  if (min === 0) return `${sec}s`;
  return `${min}m ${sec}s`;
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
  const [runs] = await Promise.all([fetchRuns()]);

  await dbConnect();
  const bankStats = await OfferModel.aggregate<BankStat>([
    { $group: { _id: "$bank", lastScraped: { $max: "$scrapedAt" }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  const byWorkflow = runs.reduce<Record<string, CiRun[]>>((acc, r) => {
    (acc[r.name] ??= []).push(r);
    return acc;
  }, {});

  // Separate Daily Crawler runs from other workflows
  const crawlerRuns = (byWorkflow["Daily Crawler"] ?? []).slice(0, 14);
  const otherWorkflows = Object.entries(byWorkflow)
    .filter(([name]) => name !== "Daily Crawler")
    .sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="px-8 py-8">
      <h1 className="mb-2 text-2xl font-bold text-foreground">CI Runs</h1>
      <p className="mb-6 text-sm text-muted-foreground">Last {runs.length} workflow runs across all branches.</p>

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
              {Object.entries(BANK_LABELS).map(([bankKey, label]) => {
                const stat = bankStats.find((s) => s._id === bankKey);
                const hoursAgo = stat
                  ? (Date.now() - new Date(stat.lastScraped).getTime()) / 3_600_000
                  : Infinity;
                const statusLabel =
                  hoursAgo < 26 ? "Today ✓" : hoursAgo < 50 ? "Yesterday" : "Stale";
                const statusColor =
                  hoursAgo < 26
                    ? "text-green-700 dark:text-green-400"
                    : hoursAgo < 50
                      ? "text-yellow-700 dark:text-yellow-400"
                      : "text-red-700 dark:text-red-400";
                return (
                  <tr key={bankKey} className="border-b border-border/50">
                    <td className="py-2.5 pr-6 font-medium text-foreground">{label}</td>
                    <td className="py-2.5 pr-6 text-muted-foreground">
                      {stat
                        ? new Date(stat.lastScraped).toLocaleString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className={`py-2.5 pr-6 font-medium ${statusColor}`}>{statusLabel}</td>
                    <td className="py-2.5 text-muted-foreground">{stat?.count ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Daily Crawler history ───────────────────────────────────── */}
      <section className="mb-8 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 font-semibold text-foreground">Daily Crawler — Last {crawlerRuns.length} Runs</h2>
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
          <p className="mt-3 text-xs text-muted-foreground">
            Each box = one day. Hover for date. Click to open the run in GitHub.
          </p>
        )}
      </section>

      {/* ── Per-workflow success cards (non-crawler) ────────────────── */}
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Crawler summary card */}
        {crawlerRuns.length > 0 && (() => {
          const success = crawlerRuns.filter((r) => r.conclusion === "success").length;
          const rate = Math.round((success / crawlerRuns.length) * 100);
          const last = crawlerRuns[0];
          return (
            <div key="crawler" className="rounded-xl border border-border bg-card p-4">
              <p className="mb-1 truncate text-xs font-medium text-muted-foreground">Daily Crawler</p>
              <p className="text-xl font-bold text-foreground">{rate}%</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{success}/{crawlerRuns.length} passed</p>
              {last && <div className="mt-2">{conclusionBadge(last.conclusion, last.status)}</div>}
            </div>
          );
        })()}
        {otherWorkflows.map(([name, wRuns]) => {
          const success = wRuns.filter((r) => r.conclusion === "success").length;
          const rate = Math.round((success / wRuns.length) * 100);
          const last = wRuns[0];
          return (
            <div key={name} className="rounded-xl border border-border bg-card p-4">
              <p className="mb-1 truncate text-xs font-medium text-muted-foreground">{name}</p>
              <p className="text-xl font-bold text-foreground">{rate}%</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{success}/{wRuns.length} passed</p>
              {last && <div className="mt-2">{conclusionBadge(last.conclusion, last.status)}</div>}
            </div>
          );
        })}
      </div>

      {/* ── Full run table ──────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold text-foreground">All Runs</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-5 py-3 font-medium">#</th>
                <th className="px-5 py-3 font-medium">Workflow</th>
                <th className="px-5 py-3 font-medium">Branch</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Duration</th>
                <th className="px-5 py-3 font-medium">Started</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="px-5 py-3 text-muted-foreground">
                    <a href={run.html_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      #{run.run_number}
                    </a>
                  </td>
                  <td className="px-5 py-3">
                    <a href={run.html_url} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground hover:underline">
                      {run.name}
                    </a>
                    <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">{run.display_title}</p>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{run.head_branch}</td>
                  <td className="px-5 py-3">{conclusionBadge(run.conclusion, run.status)}</td>
                  <td className="px-5 py-3 text-muted-foreground">{duration(run.created_at, run.updated_at)}</td>
                  <td className="px-5 py-3 text-muted-foreground">{timeAgo(run.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
