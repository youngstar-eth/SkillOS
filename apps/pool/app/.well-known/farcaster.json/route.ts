import { createManifestHandler } from '@mas/shared/miniapp'
import { APP_CONFIG, getBaseUrl } from '../../../lib/app-config'

const url = getBaseUrl()

export const GET = createManifestHandler({
  name: APP_CONFIG.title,
  subtitle: APP_CONFIG.subtitle,
  description: APP_CONFIG.description,
  homeUrl: url,
  iconUrl: `${url}/icon.png`,
  splashImageUrl: `${url}/splash.png`,
  splashBackgroundColor: APP_CONFIG.splashBg,
  heroImageUrl: `${url}/hero.png`,
  primaryCategory: 'games',
  tags: [...APP_CONFIG.tags],
})
