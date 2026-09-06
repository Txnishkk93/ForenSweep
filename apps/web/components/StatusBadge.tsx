import clsx from "clsx";
import type { Tone } from "@/lib/status-colors";
import { toneClasses } from "@/lib/status-colors";

interface Props {
  label: string;
  tone: Tone;
  className?: string;
}

export function StatusBadge({ label, tone, className }: Props) {
  const t = toneClasses[tone];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
        t.bg,
        t.text,
        t.border,
        className
      )}
    >
      {label}
    </span>
  );
}
