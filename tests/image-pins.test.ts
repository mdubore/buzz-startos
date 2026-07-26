import assert from 'node:assert/strict'
import test from 'node:test'

import {
  IMAGE_PINS,
  UPSTREAM,
  packedImageReference,
} from '../startos/image-pins.js'

const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/

test('pins the complete runtime image set by immutable OCI digest', () => {
  assert.equal(UPSTREAM.commit, 'dd222a509b156ba52ed3219e895d7bf1cf322c92')
  assert.equal(UPSTREAM.shortCommit, UPSTREAM.commit.slice(0, 7))
  assert.equal(
    IMAGE_PINS.buzz.tagReference,
    `ghcr.io/block/buzz:sha-${UPSTREAM.shortCommit}`,
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
