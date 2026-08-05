export type ImagePin = {
  readonly tagReference: string
  readonly indexDigest: `sha256:${string}`
  readonly platforms: {
    readonly amd64: `sha256:${string}`
    readonly arm64: `sha256:${string}`
  }
}

export const packedImageReference = (pin: ImagePin) =>
  `${pin.tagReference}@${pin.indexDigest}`

export const UPSTREAM = {
  commit: '651f6372754e60e3f936b3397040eb0f1e44c9f3',
  shortCommit: '651f637',
  committedAt: '2026-08-03T17:33:19Z',
  relayVersion: '0.2.0',
} as const

export const IMAGE_PINS = {
  buzz: {
    tagReference: 'ghcr.io/mdubore/buzz-startos/buzz:651f637-startos-r1',
    indexDigest:
      'sha256:0ee81c041a6054438fa064b61c900a9190ca06590cdc17a4310a22637ed98a26',
    platforms: {
      amd64:
        'sha256:cab84f6f6ce28a2651a6411e4ad21ffd530f20f673cf3805df5463bb36f7eabe',
      arm64:
        'sha256:8d14591c062a98554f900b3e90005a26455a9750e31e81f78d6a211a89e4e40e',
    },
  },
  postgres: {
    tagReference: 'postgres:17.10-alpine3.24',
    indexDigest:
      'sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193',
    platforms: {
      amd64:
        'sha256:af194ccf3e2d7fe367012c7b88ce8b816c5c889b18a5b316799a1f0d7eac746a',
      arm64:
        'sha256:b797483593b82cbea9a7ee41c88f324a90d10d9c2504d40e755d91c75456366d',
    },
  },
  redis: {
    tagReference: 'redis:7.4.9-alpine3.21',
    indexDigest:
      'sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99',
    platforms: {
      amd64:
        'sha256:b1addbe72465a718643cff9e60a58e6df1841e29d6d7d60c9a85d8d72f08d1a7',
      arm64:
        'sha256:084f4bcb3fedf990ba43d26774f58ed4697a2c044156544ac4717934ad1d57c8',
    },
  },
  minio: {
    tagReference: 'ghcr.io/mdubore/buzz-startos/minio:2025-10-15-startos-r1',
    indexDigest:
      'sha256:50b911e96ba5b3c12f6be22ae6ab960834146b12b4103a28f409a2c22868867e',
    platforms: {
      amd64:
        'sha256:8bb5422f0f83c2b10efa1963943721224f102eaa1d4159988052773bc9c0150c',
      arm64:
        'sha256:f620f328fc842376247696513ca9cffb9323402e01629043320805d41a7f23e8',
    },
  },
  minioClient: {
    tagReference: 'ghcr.io/mdubore/buzz-startos/mc:2025-08-13-startos-r1',
    indexDigest:
      'sha256:b8ebbd404e9666618152c8ddfff1ff3d2a409d2a8803abcac0eb02dab8294f5f',
    platforms: {
      amd64:
        'sha256:916cc9cebe53c0aa6a78fea51dcbdcb10326da0bacc866da3693e94b154c6f98',
      arm64:
        'sha256:1d1acfad618195a125aa59a52768a6920a9d369a70b30b852b1cd40abc3e15d9',
    },
  },
} as const satisfies Record<string, ImagePin>
