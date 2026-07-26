import { readRuntimeStateConst } from '../domain/state-validation.js'
import { sdk } from '../sdk.js'
import { readWebInterfaceOriginsConst } from '../utils.js'
import { reconcileBlockingTasks } from './reconcile-blocking-tasks.js'

export const requireSetup = sdk.setupOnInit(async (effects) => {
  const stateValidation = await readRuntimeStateConst(effects)
  const origins = await readWebInterfaceOriginsConst(effects)

  await reconcileBlockingTasks(effects, stateValidation, origins)
})
