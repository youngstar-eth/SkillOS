/**
 * Mini App manifest handler factory — serves both Base App (base.dev) and
 * Farcaster (farcaster.xyz) clients from a single /.well-known/farcaster.json.
 *
 * Shape (all three top-level keys emitted when env present):
 *   - accountAssociation       : { header, payload, signature }  — signed domain proof
 *   - baseBuilder              : { allowedAddresses: [0x…] }      — Base App addresses allowed to publish updates
 *   - miniapp                  : Base App spec (preferred)        — canonicalDomain + requiredChains
 *   - frame                    : Farcaster legacy spec mirror     — same content, `frame` key
 *
 * Env read at request time (so deploy → sign → redeploy works without code changes):
 *   - FARCASTER_HEADER / FARCASTER_PAYLOAD / FARCASTER_SIGNATURE   : domain proof
 *   - NEXT_PUBLIC_BASE_BUILDER_ADDRESS                              : verified signing address
 */

export interface ManifestConfig {
  name: string
  subtitle: string
  description: string
  homeUrl: string
  iconUrl: string
  splashImageUrl: string
  splashBackgroundColor: string
  heroImageUrl: string
  primaryCategory?: string
  tags?: string[]
  /** CAIP-2 chain IDs this mini app requires (default: Base Sepolia). */
  requiredChains?: string[]
  /** Explicit builder address. If omitted, read from NEXT_PUBLIC_BASE_BUILDER_ADDRESS env. */
  baseBuilderAddress?: string
}

function deriveCanonicalDomain(homeUrl: string): string {
  try {
    return new URL(homeUrl).hostname
  } catch {
    return homeUrl
  }
}

export function createManifestHandler(config: ManifestConfig) {
  return async function GET() {
    const header = process.env.FARCASTER_HEADER
    const payload = process.env.FARCASTER_PAYLOAD
    const signature = process.env.FARCASTER_SIGNATURE

    const builderAddress = config.baseBuilderAddress ?? process.env.NEXT_PUBLIC_BASE_BUILDER_ADDRESS

    const primaryCategory = config.primaryCategory ?? 'games'
    const tags = config.tags ?? ['arcade', 'onchain']
    const requiredChains = config.requiredChains ?? ['eip155:84532'] // Base Sepolia
    const canonicalDomain = deriveCanonicalDomain(config.homeUrl)

    // miniapp: Base App canonical shape (base.dev)
    const miniapp = {
      version: '1',
      name: config.name,
      subtitle: config.subtitle,
      description: config.description,
      iconUrl: config.iconUrl,
      homeUrl: config.homeUrl,
      splashImageUrl: config.splashImageUrl,
      splashBackgroundColor: config.splashBackgroundColor,
      heroImageUrl: config.heroImageUrl,
      primaryCategory,
      tags,
      canonicalDomain,
      requiredChains,
    }

    const body: Record<string, unknown> = {
      baseBuilder: {
        allowedAddresses: builderAddress ? [builderAddress] : [],
      },
      miniapp,
      // Farcaster legacy mirror — same content, different key. Clients that
      // still look for `frame` (older Warpcast builds, embedded feeds) read here.
      frame: miniapp,
    }

    if (header && payload && signature) {
      body.accountAssociation = { header, payload, signature }
    }

    return Response.json(body)
  }
}
