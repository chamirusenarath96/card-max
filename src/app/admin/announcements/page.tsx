import { dbConnect } from "@/lib/db/connect";
import { AnnouncementModel, type IAnnouncement } from "@/lib/models/announcement.model";
import { Badge } from "@/components/ui/badge";
import { NewAnnouncementForm } from "./NewAnnouncementForm";
import { AnnouncementRowActions } from "./AnnouncementRowActions";

export default async function AdminAnnouncementsPage() {
  await dbConnect();
  const items = (await AnnouncementModel.find().sort({ createdAt: -1 }).lean()) as IAnnouncement[];

  return (
    <div className="px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Announcements</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Only one announcement can be active at a time.
        </p>
      </div>

      <div className="mb-8">
        <NewAnnouncementForm />
      </div>

      {items.length === 0 && (
        <p className="py-16 text-center text-muted-foreground">No announcements yet.</p>
      )}

      <div className="flex flex-col gap-4">
        {items.map((item) => (
          <div
            key={item._id.toString()}
            data-testid={`announcement-row-${item._id.toString()}`}
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="mb-1 flex items-center gap-2">
                {item.active && (
                  <Badge className="bg-green-500/10 text-xs text-green-700 dark:text-green-300">
                    active
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {new Date(item.createdAt).toLocaleString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="text-sm text-foreground">{item.message}</p>
              {item.linkUrl && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.linkLabel ?? "Learn more"} → {item.linkUrl}
                </p>
              )}
            </div>
            <AnnouncementRowActions id={item._id.toString()} initialActive={item.active} />
          </div>
        ))}
      </div>
    </div>
  );
}
