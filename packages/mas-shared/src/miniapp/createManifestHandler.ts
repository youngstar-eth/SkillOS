/**
 * Farcaster Mini App manifest handler factory.
 *
 * Account association fields are read from env vars at request time
 * (FARCASTER_HEADER / FARCASTER_PAYLOAD / FARCASTER_SIGNATURE), so the
 * manifest can be deployed first and signed later without code changes.
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
}

export function createManifestHandler(config: ManifestConfig) {
  return async function GET() {
    const header = process.env.FARCASTER_HEADER
    const payload = process.env.FARCASTER_PAYLOAD
    const signature = process.env.FARCASTER_SIGNATURE

    const body: Record<string, unknown> = {
      frame: {
        version: '1',
        name: config.name,
        subtitle: config.subtitle,
        description: config.description,
        iconUrl: config.iconUrl,
        homeUrl: config.homeUrl,
        splashImageUrl: config.splashImageUrl,
        splashBackgroundColor: config.splashBackgroundColor,
        heroImageUrl: config.heroImageUrl,
        primaryCategory: config.primaryCategory ?? 'games',
        tags: config.tags ?? ['arcade', 'onchain'],
      },
    }

    if (header && payload && signature) {
      body.accountAssociation = { header, payload, signature }
    }

    return Response.json(body)
  }
}
