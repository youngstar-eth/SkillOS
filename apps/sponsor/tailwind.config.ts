import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx,js,jsx,mdx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
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
    },
  },
  plugins: [],
};

export default config;
