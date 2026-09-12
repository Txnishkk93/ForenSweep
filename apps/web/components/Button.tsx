import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

type Variant =
  | "primary"
  | "destructive"
  | "recovery"
  | "secondary"
  | "ghost"
  | "dark";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const variantClasses: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-active",
  destructive: "bg-destructive text-white hover:bg-destructive-active",
  recovery: "bg-recovery text-white hover:bg-recovery/90",
  secondary:
    "bg-surface-card text-ink border border-hairline-strong hover:border-ink/40",
  ghost: "bg-transparent text-ink hover:bg-surface-strong",
  dark: "bg-[#2B2B2B] text-white hover:bg-black",
};

export function Button({ variant = "primary", className, ...rest }: Props) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses[variant],
        className
      )}
      {...rest}
    />
  );
}
