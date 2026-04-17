/**
 * Farcaster Mini App embed metadata builder for Next.js Metadata API.
 *
 * Produces a string payload under the `fc:miniapp` meta tag so feeds
 * showing a URL render a launch button that opens the mini app.
 */

export interface EmbedConfig {
  title: string
  imageUrl: string
  homeUrl: string
  splashImageUrl: string
  splashBackgroundColor: string
  buttonTitle?: string
}

export function createEmbedMetadata(config: EmbedConfig): Record<string, string> {
  return {
    'fc:miniapp': JSON.stringify({
      version: '1',
      imageUrl: config.imageUrl,
      button: {
        title: config.buttonTitle ?? `Play ${config.title}`,
        action: {
          type: 'launch_frame',
          name: config.title,
          url: config.homeUrl,
          splashImageUrl: config.splashImageUrl,
          splashBackgroundColor: config.splashBackgroundColor,
        },
      },
    }),
  }
}
