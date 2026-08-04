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
    tagReference: 'ghcr.io/block/buzz:sha-651f637',
    indexDigest:
      'sha256:3f8d3ff503dc735e5578e68194b1dbf543e6e792ae1c7e906c735ee269d2841c',
    platforms: {
      amd64:
        'sha256:e47c31ff9bdd0359e25b9115e69c4a46c1f9cf3c508295d5a020fee6a8f40632',
      arm64:
        'sha256:40a76804867eb9880bec2e191dcb21c28ffae9c3e053e317199b9aaae0177688',
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
    tagReference: 'minio/minio:RELEASE.2025-09-07T16-13-09Z',
    indexDigest:
      'sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e',
    platforms: {
      amd64:
        'sha256:a1a8bd4ac40ad7881a245bab97323e18f971e4d4cba2c2007ec1bedd21cbaba2',
      arm64:
        'sha256:9966a92a734f9411e32f4f41d7d9d826fcdc0f68c4e20b70295bd4e7c11f8a2f',
    },
  },
  minioClient: {
    tagReference: 'minio/mc:RELEASE.2025-08-13T08-35-41Z',
    indexDigest:
      'sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727',
    platforms: {
      amd64:
        'sha256:eb4ea9884b77704230e2423e9004d2fa738dc272876b9cc41a297d29443b8780',
      arm64:
        'sha256:37d109dddbbb2c95873f5fc81ac93f37023264770fc580a7564148892087b1b7',
    },
  },
} as const satisfies Record<string, ImagePin>
