import { readRuntimeStateConst } from '../domain/state-validation.js'
import { sdk } from '../sdk.js'
import {
  readPairingInterfaceUrlsConst,
  readWebInterfaceOriginsConst,
} from '../utils.js'
import { reconcileBlockingTasks } from './reconcile-blocking-tasks.js'

export const requireSetup = sdk.setupOnInit(async (effects) => {
  const stateValidation = await readRuntimeStateConst(effects)
  const origins = await readWebInterfaceOriginsConst(effects)
  const pairingUrls = await readPairingInterfaceUrlsConst(effects)

  await reconcileBlockingTasks(effects, stateValidation, origins, pairingUrls)
})
