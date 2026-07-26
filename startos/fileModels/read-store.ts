import {
  rawStoredStateShape,
  storeRawText,
  type RawStoredState,
} from './store.json.js'

export type StoredStateRead =
  | { kind: 'missing' }
  | { kind: 'parsed'; value: RawStoredState }
  | { kind: 'unreadable'; issue: 'invalid-json' | 'invalid-root' }

export function parseStoredStateText(rawText: string | null): StoredStateRead {
  if (rawText === null) return { kind: 'missing' }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    return { kind: 'unreadable', issue: 'invalid-json' }
  }

  const result = rawStoredStateShape.safeParse(parsed)
  if (!result.success) {
    return { kind: 'unreadable', issue: 'invalid-root' }
  }

  return { kind: 'parsed', value: result.data }
}

export async function readStoredStateOnce(): Promise<StoredStateRead> {
  const raw = await storeRawText.read().once()
  return parseStoredStateText(raw?.text ?? null)
}
