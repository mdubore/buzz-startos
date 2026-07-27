import { i18n } from '../i18n/index.js'
import { sdk } from '../sdk.js'
import {
  membershipInputSpec,
  membershipMutationActionResult,
  runMembershipMutation,
  type MembershipMutationActionRunner,
} from './membership.js'

export type { MembershipMutationActionRunner } from './membership.js'

export function createAddMemberAction(
  run: MembershipMutationActionRunner = runMembershipMutation,
) {
  return sdk.Action.withInput(
    'add-member',
    {
      name: i18n('Add Member'),
      description: i18n(
        'Add a member or administrator role to a Nostr identity in the private relay.',
      ),
      warning: null,
      allowedStatuses: 'only-running',
      group: null,
      visibility: 'enabled',
      access: 'user',
    },
    membershipInputSpec,
    async () => ({ publicKey: '', role: 'member' as const }),
    async ({ effects, input }) =>
      membershipMutationActionResult(
        'Member Added',
        await run(effects, 'add', input),
      ),
  )
}

export const addMember = createAddMemberAction()
