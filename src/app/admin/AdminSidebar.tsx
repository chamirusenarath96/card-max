"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LayoutDashboard, MessageSquare, LogOut, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Session } from "next-auth";

interface Props {
  user: Session["user"];
}

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/ci", label: "CI Runs", icon: BarChart2, exact: false },
  { href: "/admin/feedback", label: "Feedback", icon: MessageSquare, exact: false },
];

export function AdminSidebar({ user }: Props) {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 flex-shrink-0 flex-col border-r border-border bg-card">
      <div className="border-b border-border px-5 py-4">
        <Link href="/" className="text-lg font-bold tracking-tight text-foreground hover:opacity-80">
          CardMax
        </Link>
        <p className="mt-0.5 text-xs text-muted-foreground">Admin</p>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border px-4 py-4">
        {user?.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt={user.name ?? "Admin"}
            className="mb-2 h-8 w-8 rounded-full"
          />
        )}
        <p className="truncate text-xs font-medium text-foreground">{user?.name}</p>
        <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
