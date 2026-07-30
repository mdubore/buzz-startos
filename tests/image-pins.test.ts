import assert from 'node:assert/strict'
import test from 'node:test'

import {
  IMAGE_PINS,
  UPSTREAM,
  packedImageReference,
} from '../startos/image-pins.js'

const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/

test('pins the complete runtime image set by immutable OCI digest', () => {
  assert.equal(UPSTREAM.commit, '63496cc1d4c6f1b7c613801bdcc694169dcf391a')
  assert.equal(UPSTREAM.shortCommit, UPSTREAM.commit.slice(0, 7))
  assert.equal(
    IMAGE_PINS.buzz.tagReference,
    `ghcr.io/block/buzz:sha-${UPSTREAM.shortCommit}`,
  )
  assert.equal(
    IMAGE_PINS.buzz.indexDigest,
    'sha256:9de8aff13af33f3b17659e6eacda024b3070efda911c5e08d4d85a6c01c4deb6',
  )
  assert.equal(
    IMAGE_PINS.buzz.platforms.amd64,
    'sha256:5ac4697562230d32de4473d2eaf2eab098300c8aae1721e6bd4bf00b2956a5bf',
  )
  assert.equal(
    IMAGE_PINS.buzz.platforms.arm64,
    'sha256:414d8e183f3ccd45eb228cfdb1d6d88da463dd7440bc726c500abd435d0e7c3c',
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
