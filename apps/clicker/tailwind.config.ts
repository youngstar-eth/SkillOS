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
        "accent-deep": "rgb(var(--color-accent-deep) / <alpha-value>)",
        "accent-soft": "rgb(var(--color-accent-soft) / <alpha-value>)",
        leaf: "rgb(var(--color-leaf) / <alpha-value>)",
        bark: "rgb(var(--color-bark) / <alpha-value>)",
        sunshine: "rgb(var(--color-sunshine) / <alpha-value>)",
        earth: "rgb(var(--color-earth) / <alpha-value>)",
        danger: "rgb(var(--color-danger) / <alpha-value>)",
        success: "rgb(var(--color-success) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-primary)"],
        display: ["var(--font-display)"],
      },
      fontSize: {
        h1: ["2.75rem", { lineHeight: "1", fontWeight: "700" }],
        h2: ["2.25rem", { lineHeight: "1.05", fontWeight: "700" }],
        h3: ["1.5rem", { lineHeight: "1.1", fontWeight: "700" }],
      },
      borderRadius: {
        DEFAULT: "10px",
        sm: "6px",
        lg: "14px",
        xl: "18px",
      },
    },
  },
  plugins: [],
};

export default config;
