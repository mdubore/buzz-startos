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
    `ghcr.io/mdubore/buzz-startos/buzz:${UPSTREAM.shortCommit}-startos-r2`,
  )
  assert.equal(
    IMAGE_PINS.buzz.indexDigest,
    'sha256:61c2c9008e3853264b3df6dbc3119ee7ba1d6278340a1780eaec0b955f2dd985',
  )
  assert.equal(
    IMAGE_PINS.buzz.platforms.amd64,
    'sha256:169af34712fa2d8e2de95626689a2580b0b3231a780d7512322a6fb69641542a',
  )
  assert.equal(
    IMAGE_PINS.buzz.platforms.arm64,
    'sha256:5966d41571e6a79e70ff13eda2fbcf06fec886d74a07b413c51d8c04198b823f',
  )
  assert.deepEqual(IMAGE_PINS.minio, {
    tagReference: 'ghcr.io/mdubore/buzz-startos/minio:2025-10-15-startos-r2',
    indexDigest:
      'sha256:5cff18515d059362060790bb17928a25b8b3653f5ac842a7742e9953ffa3a5d9',
    platforms: {
      amd64:
        'sha256:cf33684eacfc87dbde1e2bedc24c85f85ca1dc7bc7f566b220a8b04fc38667e9',
      arm64:
        'sha256:3c9bb9f4ef4e50aeb875365cf405d7ea36dac0fdfd8c294daa43808783e50821',
    },
  })
  assert.deepEqual(IMAGE_PINS.minioClient, {
    tagReference: 'ghcr.io/mdubore/buzz-startos/mc:2025-08-13-startos-r2',
    indexDigest:
      'sha256:b1a507ecdf3ef5272791bd3e5b66e9f6e9b73d093f3aab9a0f481fd1e729baf6',
    platforms: {
      amd64:
        'sha256:4c75881d7a130597c444d9d233ad0ec41dc62e6c025374f93365e7c7fa1fbd1c',
      arm64:
        'sha256:c0ea7881bae5f9e0df24bda610c6fe9ed2f51504924474a0eef0a2c4ec2a1827',
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
