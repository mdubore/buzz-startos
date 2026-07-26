import { sdk } from '../sdk'
import { completeInitialSetup } from './complete-initial-setup'
import { connectionInformation } from './connection-information'
import { verifyCanonicalUrl } from './verify-canonical-url'
import { verifyStableState } from './verify-stable-state'

export const actions = sdk.Actions.of()
  .addAction(connectionInformation)
  .addAction(completeInitialSetup)
  .addAction(verifyStableState)
  .addAction(verifyCanonicalUrl)
