// Cron failure alerting — Discord webhook with Supabase-backed dedup.
//
// Background: 3 days of silent cron 500s went undetected before PR #144 RCA
// surfaced them. Mainnet cutover requires a notification baseline.
//
// Design: graceful degradation. If DISCORD_ALERTS_WEBHOOK is unset OR the
// dedup table is unreachable, alerts no-op with a console.warn — never throw
// out of sendAlert, never block the caller's own error propagation. The
// withAlert HOF rethrows the original handler error after notifying.

import { getSupabaseService } from "@skillos/lib-shared";

export interface AlertContext {
  cron: string;
  error: unknown;
  metadata?: Record<string, unknown>;
}

interface DedupDeps {
  now?: () => number;
  fetch?: typeof fetch;
  supabase?: ReturnType<typeof getSupabaseService>;
}

const DEDUP_WINDOW_MS = 60 * 60 * 1000;

function formatError(error: unknown): string {
  if (error instanceof Error) {
    const stack = error.stack ? `\n\`\`\`${error.stack.slice(0, 1500)}\`\`\`` : "";
    return `${error.name}: ${error.message}${stack}`;
  }
  return JSON.stringify(error).slice(0, 1500);
}

function buildPayload(ctx: AlertContext) {
  return {
    content: `🚨 **Cron failure: \`${ctx.cron}\`**`,
    embeds: [
      {
        color: 0xff0000,
        title: "Production cron error",
        description: formatError(ctx.error),
        fields: ctx.metadata
          ? Object.entries(ctx.metadata).map(([k, v]) => ({
              name: k,
              value: String(v).slice(0, 200),
              inline: true,
            }))
          : [],
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

async function isDuplicate(
  cron: string,
  deps: DedupDeps,
): Promise<boolean> {
  const supabase = deps.supabase ?? getSupabaseService();
  const now = deps.now ?? Date.now;
  const { data, error } = await supabase
    .from("v2_alert_history")
    .select("sent_at")
    .eq("cron", cron)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn(`[alert] dedup lookup failed for ${cron}:`, error.message);
    return false;
  }
  if (!data?.sent_at) return false;
  const lastSent = new Date(data.sent_at).getTime();
  return now() - lastSent < DEDUP_WINDOW_MS;
}

async function recordAlert(
  cron: string,
  deps: DedupDeps,
): Promise<void> {
  const supabase = deps.supabase ?? getSupabaseService();
  const { error } = await supabase
    .from("v2_alert_history")
    .insert({ cron, sent_at: new Date().toISOString() });
  if (error) {
    console.warn(`[alert] dedup record failed for ${cron}:`, error.message);
  }
}

export async function sendAlert(
  ctx: AlertContext,
  deps: DedupDeps = {},
): Promise<void> {
  const webhook = process.env.DISCORD_ALERTS_WEBHOOK;
  if (!webhook) {
    console.warn("[alert] DISCORD_ALERTS_WEBHOOK not set, alert suppressed");
    return;
  }

  try {
    if (await isDuplicate(ctx.cron, deps)) return;
  } catch (err) {
    console.warn("[alert] dedup check threw:", err);
  }

  const doFetch = deps.fetch ?? fetch;
  try {
    await doFetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(ctx)),
    });
  } catch (err) {
    console.error("[alert] webhook POST failed:", err);
    return;
  }

  try {
    await recordAlert(ctx.cron, deps);
  } catch (err) {
    console.warn("[alert] dedup record threw:", err);
  }
}

export function withAlert<T>(
  cronName: string,
  handler: () => Promise<T>,
  deps: DedupDeps = {},
): () => Promise<T> {
  return async () => {
    try {
      return await handler();
    } catch (error) {
      await sendAlert({ cron: cronName, error }, deps);
      throw error;
    }
  };
}
