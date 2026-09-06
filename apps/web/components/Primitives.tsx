import clsx from "clsx";
import type { HTMLAttributes, ReactNode } from "react";

export function DataCard({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "rounded-card border border-hairline bg-surface-card p-5",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function MonoText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "rounded bg-canvas-soft border border-hairline px-1.5 py-0.5 font-mono text-[13px] text-ink break-all",
        className
      )}
    >
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-1 text-[13px] text-body-muted">{eyebrow}</p>
        )}
        <h2 className="text-[22px] font-medium tracking-tighter text-ink">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-sm text-body-muted">
      <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
      {label}…
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="rounded-card border border-dashed border-hairline-strong bg-canvas-soft p-10 text-center">
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {description && (
        <p className="mt-1 text-sm text-body-muted">{description}</p>
      )}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="rounded-card border border-destructive/30 bg-destructive-soft p-6">
      <p className="text-[15px] font-medium text-destructive-active">{title}</p>
      {description && (
        <p className="mt-1 text-sm text-destructive-active/80">{description}</p>
      )}
    </div>
  );
}
