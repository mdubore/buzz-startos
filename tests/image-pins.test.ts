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
    `ghcr.io/block/buzz:sha-${UPSTREAM.shortCommit}`,
  )
  assert.equal(
    IMAGE_PINS.buzz.indexDigest,
    'sha256:3f8d3ff503dc735e5578e68194b1dbf543e6e792ae1c7e906c735ee269d2841c',
  )
  assert.equal(
    IMAGE_PINS.buzz.platforms.amd64,
    'sha256:e47c31ff9bdd0359e25b9115e69c4a46c1f9cf3c508295d5a020fee6a8f40632',
  )
  assert.equal(
    IMAGE_PINS.buzz.platforms.arm64,
    'sha256:40a76804867eb9880bec2e191dcb21c28ffae9c3e053e317199b9aaae0177688',
  )
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
