import { sdk } from '../sdk.js'

// These exact sidecar pins enter as root and initialize or write without idmaps.
// Buzz is UID/GID 1000, so its StartOS-root-owned cache needs the map below.
// Reverify pinned metadata and real writes before release or any pin change.
export const buildPostgresMounts = () =>
  sdk.Mounts.of().mountVolume({
    volumeId: 'postgres',
    subpath: null,
    mountpoint: '/var/lib/postgresql',
    readonly: false,
  })

export const buildRedisMounts = () =>
  sdk.Mounts.of().mountVolume({
    volumeId: 'redis',
    subpath: null,
    mountpoint: '/data',
    readonly: false,
  })

export const buildMinioMounts = () =>
  sdk.Mounts.of().mountVolume({
    volumeId: 'media',
    subpath: null,
    mountpoint: '/data',
    readonly: false,
  })

export const buildBuzzMounts = () =>
  sdk.Mounts.of().mountVolume({
    volumeId: 'git-cache',
    subpath: null,
    mountpoint: '/data/git',
    readonly: false,
    idmap: [{ fromId: 0, toId: 1000 }],
  })
