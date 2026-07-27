import { i18n } from '../i18n/index.js'
import { sdk } from '../sdk.js'
import { listMembers, type ListMembersActionRunner } from './membership.js'

export type { ListMembersActionRunner } from './membership.js'

export function createListMembersAction(
  run: ListMembersActionRunner = listMembers,
) {
  return sdk.Action.withoutInput(
    'list-members',
    {
      name: i18n('List Members'),
      description: i18n('Display the private relay roster.'),
      warning: null,
      allowedStatuses: 'only-running',
      group: null,
      visibility: 'enabled',
      access: 'user',
    },
    async ({ effects }) => {
      const output = await run(effects)
      return {
        version: '1',
        title: i18n('Relay Members'),
        message: null,
        result: {
          type: 'single',
          name: i18n('Relay Members'),
          description: null,
          value: output,
          masked: false,
          copyable: true,
          qr: false,
        },
      }
    },
  )
}

export const listMembersAction = createListMembersAction()
