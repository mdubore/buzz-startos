import { i18n } from '../i18n/index.js'
import { sdk } from '../sdk.js'
import {
  membershipInputSpec,
  membershipMutationActionResult,
  runMembershipMutation,
  type MembershipMutationActionRunner,
} from './membership.js'

export function createRemoveMemberAction(
  run: MembershipMutationActionRunner = runMembershipMutation,
) {
  return sdk.Action.withInput(
    'remove-member',
    {
      name: i18n('Remove Member'),
      description: i18n(
        'Remove a member or administrator role from a Nostr identity in the private relay.',
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
        'Member Removed',
        await run(effects, 'remove', input),
      ),
  )
}

export const removeMember = createRemoveMemberAction()
