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
        // Y2K / Win98 palette — CSS vars hold RGB channels so Tailwind
        // opacity modifiers (bg-window/80) resolve correctly.
        bg: "rgb(var(--color-bg) / <alpha-value>)",
        window: "rgb(var(--color-window) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        fg: "rgb(var(--color-fg) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        "accent-2": "rgb(var(--color-accent-2) / <alpha-value>)",
        lavender: "rgb(var(--color-lavender) / <alpha-value>)",
        danger: "rgb(var(--color-danger) / <alpha-value>)",
        success: "rgb(var(--color-success) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-primary)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        DEFAULT: "0",
        sm: "0",
        lg: "0",
      },
    },
  },
  plugins: [],
};

export default config;
