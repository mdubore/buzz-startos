import { sdk } from '../sdk.js'

// These exact sidecar pins enter as root and initialize or write without idmaps.
// Volume ownership for the unprivileged Buzz process is prepared in main.
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
  })
