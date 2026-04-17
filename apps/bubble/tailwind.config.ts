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
        "bubble-red": "rgb(var(--color-bubble-red) / <alpha-value>)",
        "bubble-pink": "rgb(var(--color-bubble-pink) / <alpha-value>)",
        "bubble-yellow": "rgb(var(--color-bubble-yellow) / <alpha-value>)",
        "bubble-blue": "rgb(var(--color-bubble-blue) / <alpha-value>)",
        "bubble-purple": "rgb(var(--color-bubble-purple) / <alpha-value>)",
        "bubble-teal": "rgb(var(--color-bubble-teal) / <alpha-value>)",
        success: "rgb(var(--color-success) / <alpha-value>)",
        danger: "rgb(var(--color-danger) / <alpha-value>)",
        warning: "rgb(var(--color-warning) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-primary)"],
        display: ["var(--font-display)"],
      },
      fontSize: {
        h1: ["2.5rem", { lineHeight: "1.05", fontWeight: "600" }],
        h2: ["2rem", { lineHeight: "1.1", fontWeight: "600" }],
        h3: ["1.375rem", { lineHeight: "1.2", fontWeight: "600" }],
      },
      borderRadius: {
        DEFAULT: "12px",
        sm: "8px",
        lg: "16px",
        xl: "20px",
        full: "9999px",
      },
    },
  },
  plugins: [],
};

export default config;
