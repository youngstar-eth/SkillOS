// Skillbase brand constants. Single source of truth — imported by app configs,
// manifest handlers, asset generators, and anywhere we need to refer to the
// product by name or colour.

export const SKILLBASE_BRAND = {
  name: "skillbase",
  tagline: "skill market on Base",
  description: "Classic arcade games, real-money tournaments on Base.",

  colors: {
    skillYellow: "#FFC72C",
    baseBlue: "#0052FF",
    baseBlack: "#0A0B0D",
    pureWhite: "#FFFFFF",
  },

  social: {
    twitter: "@skillbase", // claim pending
    farcaster: "skillbase",
  },
} as const

export type SkillbaseBrand = typeof SKILLBASE_BRAND
