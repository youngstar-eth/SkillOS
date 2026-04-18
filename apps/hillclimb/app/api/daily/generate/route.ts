import { dailyGenerateHandler } from "@mas/shared/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = dailyGenerateHandler;
export const POST = dailyGenerateHandler;
