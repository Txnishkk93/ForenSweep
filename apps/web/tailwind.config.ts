import type { Config } from "tailwindcss";

// ForenSweep design tokens.
// Cool clinical canvas (not warm-cream, not pure white/black) — this is a
// forensic instrument, not a marketing site. Destructive red is the ONLY
// color allowed to signal danger anywhere in the app.
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f6f7f6",
        "canvas-soft": "#fbfbfa",
        "surface-card": "#ffffff",
        "surface-strong": "#e7e8e6",
        ink: "#1c1f1e",
        body: "#54574f",
        "body-muted": "#7a7d78",
        hairline: "#e2e4e1",
        "hairline-strong": "#c7c9c5",
        primary: "#2f5d8a",
        "primary-active": "#234a70",
        "primary-soft": "#e7eef5",
        destructive: "#cf2d56",
        "destructive-active": "#a82245",
        "destructive-soft": "#fbe9ed",
        recovery: "#6f5fb3",
        "recovery-soft": "#eeebf8",
        warning: "#8a6a12",
        "warning-soft": "#faf1dc",
        success: "#1f8a65",
        "success-soft": "#e5f4ef",
      },
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: ["'JetBrains Mono'", "'Fira Code'", "ui-monospace", "monospace"],
      },
      borderRadius: {
        DEFAULT: "6px",
        card: "10px",
      },
      boxShadow: {
        none: "none",
      },
      letterSpacing: {
        tightest: "-0.04em",
        tighter: "-0.02em",
      },
    },
  },
  plugins: [],
} satisfies Config;
