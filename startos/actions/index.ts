import { sdk } from '../sdk'
import { addMember } from './add-member'
import { completeInitialSetup } from './complete-initial-setup'
import { connectionInformation } from './connection-information'
import { listMembersAction } from './list-members'
import { removeMember } from './remove-member'
import { verifyCanonicalUrl } from './verify-canonical-url'
import { verifyStableState } from './verify-stable-state'

export const actions = sdk.Actions.of()
  .addAction(connectionInformation)
  .addAction(addMember)
  .addAction(removeMember)
  .addAction(listMembersAction)
  .addAction(completeInitialSetup)
  .addAction(verifyStableState)
  .addAction(verifyCanonicalUrl)
