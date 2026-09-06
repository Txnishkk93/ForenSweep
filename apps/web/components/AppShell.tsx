"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/devices", label: "Devices" },
  { href: "/erase/new", label: "Erasure" },
  { href: "/recover/new", label: "Recovery" },
  { href: "/certificates", label: "Certificates" },
  { href: "/audit", label: "Audit log" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-canvas">
      <div className="flex min-h-screen">
        <aside className="w-60 shrink-0 border-r border-hairline bg-surface-card px-4 py-6">
          <div className="mb-8 px-2">
            <p className="text-[18px] font-medium tracking-tighter text-ink">
              ForenSweep
            </p>
            <p className="text-[12px] text-body-muted">Forensic operations</p>
          </div>
          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "rounded px-3 py-2 text-[14px] font-medium transition-colors",
                    active
                      ? "bg-primary-soft text-primary-active"
                      : "text-body hover:bg-canvas-soft hover:text-ink"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
