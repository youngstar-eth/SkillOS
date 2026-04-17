import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Stripe palette — CSS vars hold RGB channels so Tailwind opacity
        // modifiers (bg-fg/5, text-muted/60) resolve correctly.
        bg: "rgb(var(--color-bg) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        fg: "rgb(var(--color-fg) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        subtle: "rgb(var(--color-subtle) / <alpha-value>)",
        border: "rgb(var(--color-border) / <alpha-value>)",
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        "accent-soft": "rgb(var(--color-accent-soft) / <alpha-value>)",
        "accent-deep": "rgb(var(--color-accent-deep) / <alpha-value>)",
        success: "rgb(var(--color-success) / <alpha-value>)",
        warning: "rgb(var(--color-warning) / <alpha-value>)",
        error: "rgb(var(--color-error) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-primary)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        h1: ["2rem", { lineHeight: "1.1", fontWeight: "600", letterSpacing: "-0.02em" }],
        h2: ["1.5rem", { lineHeight: "1.15", fontWeight: "600", letterSpacing: "-0.02em" }],
        h3: ["1.125rem", { lineHeight: "1.25", fontWeight: "600" }],
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "8px",
        lg: "12px",
        xl: "16px",
      },
    },
  },
  plugins: [],
};

export default config;
