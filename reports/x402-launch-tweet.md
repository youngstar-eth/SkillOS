# x402 Launch Tweet — Draft

For the `@skillbase_games` announcement when we flip the switch on
public availability of the six x402 endpoints.

## Primary tweet (280 chars)

> Skillbase is live on @x402foundation.
>
> Six production endpoints. USDC on Base Sepolia via the @base + @coinbasedev CDP facilitator. Agents pay per call, retrieve verified gaming-decision data + AI Coach inference. No accounts, no API keys, no handshake.
>
> ↓ docs + live tx hashes

## Reply in thread — endpoints breakdown

> The six routes:
>
> • sp-tier-distribution — aggregate skill histogram, $0.01
> • decision-sample (4 tier-filtered) — verified human traces, $0.01–$0.10
> • coach-sample — live Claude Haiku inference, $0.05
>
> All discoverable via the x402 Bazaar.

## Reply in thread — architecture

> How it works:
>
> 1. Agent GETs endpoint → 402 + signed payment-required envelope
> 2. Agent signs EIP-3009 `transferWithAuthorization` on USDC
> 3. Retry with x-payment header → CDP facilitator verifies + settles on-chain
> 4. Response + x-payment-response header with tx hash
>
> Settlement before payload, always.

## Reply in thread — proof + reproduce

> Full docs + the test agent script (signs real payments, walks all 6 routes):
>
> https://skillbase.games/x402
> https://github.com/youngstar-eth/skillbase/blob/main/reports/x402-live-proof.md
> https://github.com/youngstar-eth/skillbase/blob/main/scripts/x402-smoke.ts
>
> First production x402 deployment in skill gaming.

## Alt text for any screenshots

*Screenshot of /x402 page:* "Three endpoint cards listing sp-tier-distribution ($0.01), decision-sample tier-filtered ($0.01–$0.10), coach-sample ($0.05), each with curl example and Bazaar category chip. Dark Linear-style UI with Base blue and gold accents."

*Screenshot of BaseScan tx:* "A Base Sepolia transferWithAuthorization transaction showing 10000 μUSDC ($0.01) moving from test wallet to Skillbase payTo address, status success."

## Tag list (pin this)

- `@skillbase_games` — account posting
- `@base` — chain tag
- `@coinbasedev` — CDP facilitator
- `@x402foundation` — protocol

## Do not post until

- [ ] Bazaar listing confirmed for all 6 routes (query `…/discovery/resources` + grep payTo)
- [ ] apex /x402 is live (already ✓)
- [ ] reports/x402-live-proof.md pushed to main (already ✓)
- [ ] At least 24h post-submission window (avoid competing with pitch traffic)
