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
        // Bauhaus100 extracted tokens — CSS vars hold RGB channels so Tailwind
        // opacity modifiers (bg-fg/10) resolve correctly.
        bg: "rgb(var(--color-bg) / <alpha-value>)",
        fg: "rgb(var(--color-fg) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        "accent-primary": "rgb(var(--color-accent-primary) / <alpha-value>)",
        "accent-secondary": "rgb(var(--color-accent-secondary) / <alpha-value>)",
        "accent-tertiary": "rgb(var(--color-accent-tertiary) / <alpha-value>)",
        danger: "rgb(var(--color-danger) / <alpha-value>)",
        tile: "var(--color-tile)",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
      },
      fontSize: {
        "h1": ["3rem", { lineHeight: "1.2", fontWeight: "700" }],
        "h2": ["2rem", { lineHeight: "1.2", fontWeight: "600" }],
        "h3": ["1.5rem", { lineHeight: "1.2", fontWeight: "600" }],
      },
      // 2048 scan reported a 5px base grid — override default Tailwind spacing at key steps
      spacing: {
        "0.5b": "2.5px",
        "1b": "5px",
        "2b": "10px",
        "3b": "15px",
        "4b": "20px",
        "6b": "30px",
        "8b": "40px",
      },
      borderRadius: {
        DEFAULT: "8px",
      },
    },
  },
  plugins: [],
};

export default config;
