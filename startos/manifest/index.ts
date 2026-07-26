import { setupManifest } from '@start9labs/start-sdk'
import { IMAGE_PINS, packedImageReference, type ImagePin } from '../image-pins'
import { long, short } from './i18n'

const image = (pin: ImagePin) => ({
  source: { dockerTag: packedImageReference(pin) },
  arch: ['x86_64', 'aarch64'] as ['x86_64', 'aarch64'],
})

export const manifest = setupManifest({
  id: 'buzz',
  title: 'Buzz',
  license: 'Apache-2.0',
  packageRepo: 'https://github.com/mdubore/buzz-startos',
  upstreamRepo: 'https://github.com/block/buzz',
  marketingUrl: 'https://github.com/block/buzz',
  donationUrl: null,
  description: { short, long },
  volumes: ['startos', 'postgres', 'redis', 'media', 'git-cache'],
  images: {
    buzz: image(IMAGE_PINS.buzz),
    postgres: image(IMAGE_PINS.postgres),
    redis: image(IMAGE_PINS.redis),
    minio: image(IMAGE_PINS.minio),
    'minio-client': image(IMAGE_PINS.minioClient),
  },
  alerts: {
    install: null,
    update: null,
    uninstall: null,
    restore: null,
    start: null,
    stop: null,
  },
  dependencies: {},
})
