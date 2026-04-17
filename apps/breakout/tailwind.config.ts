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
        "synth-pink": "rgb(var(--color-synth-pink) / <alpha-value>)",
        "synth-purple": "rgb(var(--color-synth-purple) / <alpha-value>)",
        "synth-cyan": "rgb(var(--color-synth-cyan) / <alpha-value>)",
        "synth-yellow": "rgb(var(--color-synth-yellow) / <alpha-value>)",
        success: "rgb(var(--color-success) / <alpha-value>)",
        danger: "rgb(var(--color-danger) / <alpha-value>)",
        warning: "rgb(var(--color-warning) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-primary)"],
        mono: ["var(--font-primary)"],
      },
      fontSize: {
        h1: ["2.5rem", { lineHeight: "1", fontWeight: "700", letterSpacing: "-0.03em" }],
        h2: ["1.75rem", { lineHeight: "1.1", fontWeight: "700", letterSpacing: "-0.02em" }],
        h3: ["1.25rem", { lineHeight: "1.2", fontWeight: "700" }],
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
