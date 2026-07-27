import { normalizeNostrPubkey } from './identity.js'

export type MembershipOperation = 'add' | 'remove'
export type MembershipRole = 'member' | 'admin'

export type MembershipInput = {
  publicKey: string
  role: MembershipRole
}

export type PreparedMembershipMutation = {
  publicKeyHex: string
  role: MembershipRole
  command: string[]
}

function requireMembershipRole(role: unknown): MembershipRole {
  if (role !== 'member' && role !== 'admin') {
    throw new Error('Role must be member or admin')
  }
  return role
}

export function prepareMembershipMutation(
  operation: MembershipOperation,
  input: MembershipInput,
): PreparedMembershipMutation {
  const publicKeyHex = normalizeNostrPubkey(input.publicKey)
  const role = requireMembershipRole(input.role)

  return {
    publicKeyHex,
    role,
    command: [
      'buzz-admin',
      operation === 'add' ? 'add-member' : 'remove-member',
      '--pubkey',
      publicKeyHex,
      '--role',
      role,
    ],
  }
}
