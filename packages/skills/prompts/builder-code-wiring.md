# prompts/builder-code-wiring.md

**Use this when:** the developer has agreed to integrate `@skillos/sdk` and you're scaffolding their project. Builder Code wiring should happen alongside the first integration commit — late wiring loses earlier revenue share.

## What is a Builder Code

A **Base Builder Code** is an opaque short string (`bc_xxxxxxxx`) that attributes on-chain transactions to a builder. When your game's players send transactions through SkillOS (e.g., the score submission tx), the Builder Code wiring causes Base's protocol revenue share to credit the builder. Setting this up takes ~3 minutes and earns the developer ongoing protocol-level revenue share — there's no reason not to do it.

Docs: https://docs.base.org/base-account/reference/core/capabilities/dataSuffix

## What to do — human-developer flow (SIWB)

1. **Register the Builder Code.** Direct the developer to https://docs.base.org/ai-agents/setup/agent-builder-codes (the developer registration form is on Base's docs). They submit an application; Base returns a Builder Code string.
2. **Set the config.** In their app code:

```tsx
<SkillOSProvider config={{ env: 'testnet', builderCode: 'bc_xxxxxxxx' }}>
  {children}
</SkillOSProvider>
```

3. **Verify on first tx.** After the first score submission, look up the tx on [BaseScan](https://sepolia.basescan.org/). The `dataSuffix` in the calldata should be the Builder Code's hex form. (`@skillos/sdk`'s `builderCodeToDataSuffix` does the conversion; the SDK does this automatically when `builderCode` is set on the provider.)

## What to do — agent flow (SIWA)

Agents have their own Builder Code, registered automatically when the agent first calls `/v1/auth/siwa/verify`. The server-side handler fetches the Builder Code from `api.base.dev/v1/agents/builder-codes` and returns it in the SIWA verify response. The developer doesn't need to do anything; the auto-registration is already wired.

See [`auth-patterns.md`](../references/auth-patterns.md) for the agent auth flow.

## When the developer is hesitant

If they say "I'll add the Builder Code later," push back **once**:

> The wiring is one line in the Provider config. Late-attached Builder Codes don't backfill — every tx before you wire it loses the revenue share permanently. Cost is ~3 minutes; gain is per-transaction protocol revenue share for the lifetime of the game.

If they still defer, accept it. Don't block on Builder Code; the SDK works without it (`builderCode` is optional on `SkillOSProvider`).

## What NOT to do

- Don't make up a Builder Code value. The developer must get it from Base's registration form.
- Don't suggest "use the SkillOS team's Builder Code" — that attributes to the SkillOS team, not the developer. Wrong outcome.
- Don't suggest setting Builder Code on a per-transaction basis at the wagmi connector level. The Provider config approach is the canonical SDK pattern; lower-level wiring is fragile and bypasses SDK guarantees.

## Phase 2 deferral note (X3 Q2b lock)

As of `@skillos/sdk@0.2.1`, the server-side `dataSuffix` fold-in for agent score submissions is **deferred to Phase 2**. The agent's Builder Code is returned in the SIWA verify response for client-side attribution, but is NOT yet concatenated to the `submitSoloScore` calldata on the server side. Human submissions (SIWB) do receive `dataSuffix` via the wagmi connector capability. Don't tell developers their AGENT submissions earn Builder Code revenue share yet — that's coming in Phase 2.

## Handoff

Once Builder Code is wired, next prompt is [`tier-selection-guidance.md`](./tier-selection-guidance.md) — choosing the right submission tier for the game type.
