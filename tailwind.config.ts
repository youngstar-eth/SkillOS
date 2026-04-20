import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,js,jsx,mdx}"],
  theme: {
    extend: {
      colors: {
        skill: "#FFC72C",
        base: "#0052FF",
        bg: {
          DEFAULT: "#0a0a0a",
          elev: "#141414",
          elev2: "#1c1c1c",
        },
        border: {
          DEFAULT: "#262626",
          subtle: "#1f1f1f",
        },
      },
      keyframes: {
        pulseRing: {
          "0%": { transform: "scale(0.9)", opacity: "0.8" },
          "80%, 100%": { transform: "scale(1.6)", opacity: "0" },
        },
        tilePop: {
          "0%": { transform: "scale(0)" },
          "60%": { transform: "scale(1.1)" },
          "100%": { transform: "scale(1)" },
        },
      },
      animation: {
        pulseRing: "pulseRing 1.8s cubic-bezier(0.215, 0.61, 0.355, 1) infinite",
        tilePop: "tilePop 180ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
