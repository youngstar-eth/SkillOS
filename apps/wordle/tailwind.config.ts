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
        // Linear.app tokens — CSS vars hold RGB channels so Tailwind opacity
        // modifiers (bg-fg/10, text-muted/60) resolve correctly.
        bg: "rgb(var(--color-bg) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        fg: "rgb(var(--color-fg) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        subtle: "rgb(var(--color-subtle) / <alpha-value>)",
        border: "rgb(var(--color-border) / <alpha-value>)",
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        "accent-hover": "rgb(var(--color-accent-hover) / <alpha-value>)",
        "accent-soft": "rgb(var(--color-accent-soft) / <alpha-value>)",

        // Wordle tile/key state colors
        success: "rgb(var(--color-success) / <alpha-value>)",
        warning: "rgb(var(--color-warning) / <alpha-value>)",
        absent: "rgb(var(--color-absent) / <alpha-value>)",
        danger: "rgb(var(--color-danger) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-primary)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        "h1": ["2.25rem", { lineHeight: "1.1", fontWeight: "600", letterSpacing: "-0.02em" }],
        "h2": ["1.5rem", { lineHeight: "1.2", fontWeight: "600", letterSpacing: "-0.02em" }],
        "h3": ["1.125rem", { lineHeight: "1.3", fontWeight: "600" }],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius)",
        lg: "var(--radius-lg)",
      },
    },
  },
  plugins: [],
};

export default config;
