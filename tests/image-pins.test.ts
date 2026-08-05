import assert from 'node:assert/strict'
import test from 'node:test'

import {
  IMAGE_PINS,
  UPSTREAM,
  packedImageReference,
} from '../startos/image-pins.js'

const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/

test('pins the complete runtime image set by immutable OCI digest', () => {
  assert.equal(UPSTREAM.commit, '651f6372754e60e3f936b3397040eb0f1e44c9f3')
  assert.equal(UPSTREAM.shortCommit, '651f637')
  assert.equal(UPSTREAM.shortCommit, UPSTREAM.commit.slice(0, 7))
  assert.equal(UPSTREAM.committedAt, '2026-08-03T17:33:19Z')
  assert.equal(UPSTREAM.relayVersion, '0.2.0')
  assert.equal(
    IMAGE_PINS.buzz.tagReference,
    `ghcr.io/mdubore/buzz-startos/buzz:${UPSTREAM.shortCommit}-startos-r1`,
  )
  assert.equal(
    IMAGE_PINS.buzz.indexDigest,
    'sha256:0ee81c041a6054438fa064b61c900a9190ca06590cdc17a4310a22637ed98a26',
  )
  assert.equal(
    IMAGE_PINS.buzz.platforms.amd64,
    'sha256:cab84f6f6ce28a2651a6411e4ad21ffd530f20f673cf3805df5463bb36f7eabe',
  )
  assert.equal(
    IMAGE_PINS.buzz.platforms.arm64,
    'sha256:8d14591c062a98554f900b3e90005a26455a9750e31e81f78d6a211a89e4e40e',
  )
  assert.deepEqual(IMAGE_PINS.minio, {
    tagReference: 'ghcr.io/mdubore/buzz-startos/minio:2025-10-15-startos-r1',
    indexDigest:
      'sha256:50b911e96ba5b3c12f6be22ae6ab960834146b12b4103a28f409a2c22868867e',
    platforms: {
      amd64:
        'sha256:8bb5422f0f83c2b10efa1963943721224f102eaa1d4159988052773bc9c0150c',
      arm64:
        'sha256:f620f328fc842376247696513ca9cffb9323402e01629043320805d41a7f23e8',
    },
  })
  assert.deepEqual(IMAGE_PINS.minioClient, {
    tagReference: 'ghcr.io/mdubore/buzz-startos/mc:2025-08-13-startos-r1',
    indexDigest:
      'sha256:b8ebbd404e9666618152c8ddfff1ff3d2a409d2a8803abcac0eb02dab8294f5f',
    platforms: {
      amd64:
        'sha256:916cc9cebe53c0aa6a78fea51dcbdcb10326da0bacc866da3693e94b154c6f98',
      arm64:
        'sha256:1d1acfad618195a125aa59a52768a6920a9d369a70b30b852b1cd40abc3e15d9',
    },
  })
  assert.deepEqual(Object.keys(IMAGE_PINS).sort(), [
    'buzz',
    'minio',
    'minioClient',
    'postgres',
    'redis',
  ])

  for (const pin of Object.values(IMAGE_PINS)) {
    assert.match(pin.indexDigest, SHA256_DIGEST)
    assert.match(pin.platforms.amd64, SHA256_DIGEST)
    assert.match(pin.platforms.arm64, SHA256_DIGEST)
    assert.equal(
      packedImageReference(pin),
      `${pin.tagReference}@${pin.indexDigest}`,
    )
    assert.match(packedImageReference(pin), /@sha256:[0-9a-f]{64}$/)
  }
})
