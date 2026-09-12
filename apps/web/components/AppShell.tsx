"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  ClipboardList,
  FileCheck2,
  HardDrive,
  LayoutDashboard,
  MoreHorizontal,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { getUser } from "@/lib/auth";
import type { AuthUser } from "@/lib/types";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/devices", label: "Devices", icon: HardDrive },
  { href: "/erase/new", label: "Erasure", icon: ShieldAlert },
  { href: "/recover/new", label: "Recovery", icon: RotateCcw },
  { href: "/certificates", label: "Certificates", icon: FileCheck2 },
  { href: "/audit", label: "Audit log", icon: ClipboardList },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(getUser());
  }, []);

  const username = user?.username ?? "Signed-out user";
  const initials = user?.username.slice(0, 2).toUpperCase() ?? "--";
  const role = user?.role?.toLowerCase() ?? "no active session";

  return (
    <div className="h-screen overflow-hidden bg-canvas">
      <div className="flex h-full min-h-0">
        <aside className="flex h-full w-[260px] shrink-0 flex-col overflow-hidden border-r border-hairline border-t-2 border-t-ink bg-surface-card">
          <div className="shrink-0 border-b border-hairline px-5 pb-5 pt-6">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-ink">
                <div className="h-3.5 w-3.5 rounded-[3px] border-2 border-white" />
              </div>
              <p className="text-[17px] font-bold tracking-[-0.03em] text-ink">
                ForenSweep
              </p>
            </div>
            <p className="mt-3 text-[12px] text-body-muted">Forensic operations</p>
          </div>

          <nav aria-label="Workspace" className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
            <p className="px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-body-muted">
              Workspace
            </p>
            <div className="mt-3 flex flex-col gap-1">
              {NAV_ITEMS.map((item) => {
                const active = pathname?.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      "flex items-center gap-3 rounded-[7px] px-3 py-2.5 text-[13px] font-medium transition-colors",
                      active
                        ? "bg-canvas-soft text-ink"
                        : "text-body hover:bg-canvas-soft hover:text-ink",
                    )}
                  >
                    <Icon
                      className={clsx("h-4 w-4", active ? "text-ink" : "text-body-muted")}
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className="shrink-0 px-4 pb-4">
            <div className="rounded-[10px] border border-hairline bg-canvas-soft px-4 py-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] font-medium text-body-muted">Compliance posture</span>
                <span className="text-[15px] font-bold text-ink">—</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-strong">
                <div className="h-full w-0 rounded-full bg-ink" />
              </div>
              <p className="mt-2 text-[10.5px] text-body-muted">No posture data available</p>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-3 border-t border-hairline px-5 py-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-[10px] font-bold text-white">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold text-ink">{username}</p>
              <p className="mt-0.5 text-[10.5px] capitalize text-body-muted">{role}</p>
            </div>
            <button
              type="button"
              aria-label="Profile options"
              className="flex h-7 w-7 items-center justify-center rounded-md text-body-muted hover:bg-canvas-soft hover:text-ink"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </aside>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
