import { sdk } from '../sdk'
import { setDependencies } from '../dependencies'
import { setInterfaces } from '../interfaces'
import { versionGraph } from '../versions'
import { actions } from '../actions'
import { restoreInit } from '../backups'
import { requireSetup } from './require-setup'
import { seedSecrets } from './seed-secrets'

export const init = sdk.setupInit(
  restoreInit,
  versionGraph,
  setInterfaces,
  setDependencies,
  actions,
  seedSecrets,
  requireSetup,
)

export const uninit = sdk.setupUninit(versionGraph)
