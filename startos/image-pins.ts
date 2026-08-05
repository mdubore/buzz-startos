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
    tagReference: 'ghcr.io/mdubore/buzz-startos/buzz:651f637-startos-r2',
    indexDigest:
      'sha256:61c2c9008e3853264b3df6dbc3119ee7ba1d6278340a1780eaec0b955f2dd985',
    platforms: {
      amd64:
        'sha256:169af34712fa2d8e2de95626689a2580b0b3231a780d7512322a6fb69641542a',
      arm64:
        'sha256:5966d41571e6a79e70ff13eda2fbcf06fec886d74a07b413c51d8c04198b823f',
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
    tagReference: 'ghcr.io/mdubore/buzz-startos/minio:2025-10-15-startos-r2',
    indexDigest:
      'sha256:5cff18515d059362060790bb17928a25b8b3653f5ac842a7742e9953ffa3a5d9',
    platforms: {
      amd64:
        'sha256:cf33684eacfc87dbde1e2bedc24c85f85ca1dc7bc7f566b220a8b04fc38667e9',
      arm64:
        'sha256:3c9bb9f4ef4e50aeb875365cf405d7ea36dac0fdfd8c294daa43808783e50821',
    },
  },
  minioClient: {
    tagReference: 'ghcr.io/mdubore/buzz-startos/mc:2025-08-13-startos-r2',
    indexDigest:
      'sha256:b1a507ecdf3ef5272791bd3e5b66e9f6e9b73d093f3aab9a0f481fd1e729baf6',
    platforms: {
      amd64:
        'sha256:4c75881d7a130597c444d9d233ad0ec41dc62e6c025374f93365e7c7fa1fbd1c',
      arm64:
        'sha256:c0ea7881bae5f9e0df24bda610c6fe9ed2f51504924474a0eef0a2c4ec2a1827',
    },
  },
} as const satisfies Record<string, ImagePin>
