// Deep import (NOT via @mas/shared/api barrel) — the barrel pulls in
// analyze.ts which uses node:crypto, and this route runs on the Edge
// runtime where node:* schemes are unavailable.
import { ogWinCardHandler } from "@mas/shared/api/og-win-card";

export const runtime = "edge";
export const GET = ogWinCardHandler;
