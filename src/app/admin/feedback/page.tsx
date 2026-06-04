import { dbConnect } from "@/lib/db/connect";
import { FeedbackModel, type IFeedback } from "@/lib/models/feedback.model";
import { Badge } from "@/components/ui/badge";
import { FeedbackActions } from "./FeedbackActions";

interface Props {
  searchParams: Promise<{ token?: string }>;
}

const TYPE_COLOR: Record<string, string> = {
  suggestion: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  bug: "bg-red-500/10 text-red-700 dark:text-red-300",
  other: "bg-muted text-muted-foreground",
};

export default async function AdminFeedbackPage({ searchParams }: Props) {
  const { token } = await searchParams;
  const adminToken = process.env.ADMIN_TOKEN;

  if (!adminToken || token !== adminToken) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Unauthorized. Append ?token=ADMIN_TOKEN to the URL.</p>
      </main>
    );
  }

  await dbConnect();
  const items = (await FeedbackModel.find().sort({ createdAt: -1 }).lean()) as IFeedback[];

  const newCount = items.filter((i) => i.status === "new").length;

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Feedback</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {items.length} total · {newCount} unresolved
          </p>
        </div>
      </div>

      {items.length === 0 && (
        <p className="text-center text-muted-foreground py-16">No feedback yet.</p>
      )}

      <div className="flex flex-col gap-4">
        {items.map((item) => (
          <div
            key={item._id.toString()}
            className="rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TYPE_COLOR[item.type] ?? TYPE_COLOR["other"]}`}
              >
                {item.type}
              </span>
              {item.status === "converted" && (
                <Badge variant="secondary" className="text-xs">converted</Badge>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {new Date(item.createdAt).toLocaleString("en-GB", {
                  day: "2-digit", month: "short", year: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </span>
            </div>

            <p className="whitespace-pre-wrap text-sm text-foreground">{item.message}</p>

            {item.email && (
              <p className="mt-2 text-xs text-muted-foreground">
                From:{" "}
                <a href={`mailto:${item.email}`} className="hover:underline">
                  {item.email}
                </a>
              </p>
            )}

            <div className="mt-4 border-t border-border pt-3">
              <FeedbackActions
                id={item._id.toString()}
                token={token}
                initialStatus={item.status}
                initialIssueUrl={item.githubIssueUrl}
              />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
