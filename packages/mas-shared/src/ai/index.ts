// Public entry for the AI layer.

export { anthropic, CHALLENGE_MODEL, COACH_MODEL } from "./client";
export { generateDailyChallenge } from "./generate-challenge";
export { analyzeRun } from "./analyze-run";
export * from "./types";
export * as prompts from "./prompts";
