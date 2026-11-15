import { describe, expect, it } from 'vitest'
import { IMAGE_ORIGINS, contentSecurityPolicy } from './content-security-policy'

describe('contentSecurityPolicy', () => {
  const directive = (name: string) =>
    contentSecurityPolicy()
      .split('; ')
      .find((d) => d.startsWith(`${name} `)) ?? ''

  it('allows the image generator in img-src only', () => {
    for (const origin of IMAGE_ORIGINS) {
      expect(directive('img-src')).toContain(origin)
      expect(directive('connect-src')).not.toContain(origin)
    }
  })
})
