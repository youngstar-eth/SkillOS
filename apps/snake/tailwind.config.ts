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
        // Vaporwave tokens — CSS vars hold RGB channels so Tailwind opacity
        // modifiers (bg-accent/20, text-fg/60) resolve correctly.
        bg: "rgb(var(--color-bg) / <alpha-value>)",
        fg: "rgb(var(--color-fg) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        grid: "rgb(var(--color-grid) / <alpha-value>)",
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        "accent-2": "rgb(var(--color-accent-2) / <alpha-value>)",
        danger: "rgb(var(--color-danger) / <alpha-value>)",
        success: "rgb(var(--color-success) / <alpha-value>)",
        warning: "rgb(var(--color-warning) / <alpha-value>)",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        mono: ["var(--font-primary)"],
      },
      fontSize: {
        h1: ["2.75rem", { lineHeight: "1", fontWeight: "400", letterSpacing: "0.06em" }],
        h2: ["2rem", { lineHeight: "1.1", fontWeight: "400", letterSpacing: "0.05em" }],
        h3: ["1.375rem", { lineHeight: "1.2", fontWeight: "400", letterSpacing: "0.04em" }],
      },
      borderRadius: {
        DEFAULT: "4px",
        sm: "2px",
      },
    },
  },
  plugins: [],
};

export default config;
