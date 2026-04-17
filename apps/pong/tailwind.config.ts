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
        bg: "rgb(var(--color-bg) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        "surface-2": "rgb(var(--color-surface-2) / <alpha-value>)",
        fg: "rgb(var(--color-fg) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        border: "rgb(var(--color-border) / <alpha-value>)",
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        "accent-alt": "rgb(var(--color-accent-alt) / <alpha-value>)",
        success: "rgb(var(--color-success) / <alpha-value>)",
        warning: "rgb(var(--color-warning) / <alpha-value>)",
        danger: "rgb(var(--color-danger) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-primary)"],
        mono: ["var(--font-primary)"],
        display: ["var(--font-display)"],
      },
      fontSize: {
        h1: ["2.25rem", { lineHeight: "1.1", fontWeight: "700", letterSpacing: "-0.02em" }],
        h2: ["1.5rem", { lineHeight: "1.2", fontWeight: "700", letterSpacing: "-0.02em" }],
        h3: ["1.125rem", { lineHeight: "1.3", fontWeight: "600" }],
      },
      borderRadius: {
        DEFAULT: "6px",
        lg: "8px",
      },
    },
  },
  plugins: [],
};

export default config;
