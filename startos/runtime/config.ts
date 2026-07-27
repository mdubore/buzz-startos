import {
  BUZZ_HEALTH_PORT,
  BUZZ_METRICS_PORT,
  BUZZ_PORT,
  POSTGRES_DB,
  POSTGRES_USER,
  S3_BUCKET,
} from '../constants.js'
import { derivePublicConfig } from '../domain/public-url.js'
import type {
  RuntimeStateValidation,
  StateValidation,
} from '../domain/state-validation.js'

export type ConnectionUrlParts = {
  protocol: string
  username: string
  password: string
  authority: string
  pathname?: string
}

export type RuntimeConfig = {
  postgresEnv: Record<string, string>
  redisEnv: Record<string, string>
  minioEnv: Record<string, string>
  buzzEnv: Record<string, string>
}

type RuntimeReadyState = Extract<
  RuntimeStateValidation,
  { kind: 'ready' }
>['state']

type RequiredStringField = Exclude<keyof RuntimeReadyState, 'schemaVersion'>
type RequiredField = RequiredStringField | 'schemaVersion'

function invalidField(field: RequiredField): never {
  throw new Error(`Cannot build Buzz runtime config: invalid ${field}`)
}

function requireString(
  state: RuntimeReadyState,
  field: RequiredStringField,
): string {
  const value: unknown = state[field]
  if (typeof value !== 'string' || value.length === 0) {
    invalidField(field)
  }
  return value
}

export function buildConnectionUrl({
  protocol,
  username,
  password,
  authority,
  pathname = '',
}: ConnectionUrlParts): string {
  return `${protocol}://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${authority}${pathname}`
}

export function buildRuntimeConfig(
  validation: StateValidation | RuntimeStateValidation,
): RuntimeConfig {
  if (validation.kind === 'needs-setup') {
    throw new Error(
      'Cannot build Buzz runtime config: initial setup is incomplete',
    )
  }
  if (validation.kind === 'needs-state-recovery') {
    throw new Error(
      'Cannot build Buzz runtime config: stable state requires recovery',
    )
  }

  const state: RuntimeReadyState = validation.state
  if (state.schemaVersion !== 1) invalidField('schemaVersion')

  const postgresPassword = requireString(state, 'postgresPassword')
  const redisPassword = requireString(state, 'redisPassword')
  const s3AccessKey = requireString(state, 's3AccessKey')
  const s3SecretKey = requireString(state, 's3SecretKey')
  const relayPrivateKeyHex = requireString(state, 'relayPrivateKeyHex')
  const gitHookHmacSecretHex = requireString(state, 'gitHookHmacSecretHex')
  const ownerPubkeyHex = requireString(state, 'ownerPubkeyHex')
  const primaryUrl = requireString(state, 'primaryUrl')

  let publicConfig
  try {
    publicConfig = derivePublicConfig(primaryUrl)
  } catch {
    invalidField('primaryUrl')
  }
  if (publicConfig.primaryUrl !== primaryUrl) invalidField('primaryUrl')

  const databaseUrl = buildConnectionUrl({
    protocol: 'postgres',
    username: POSTGRES_USER,
    password: postgresPassword,
    authority: '127.0.0.1:5432',
    pathname: `/${POSTGRES_DB}`,
  })
  const redisUrl = buildConnectionUrl({
    protocol: 'redis',
    username: '',
    password: redisPassword,
    authority: '127.0.0.1:6379',
  })

  return {
    postgresEnv: {
      POSTGRES_DB,
      POSTGRES_USER,
      POSTGRES_PASSWORD: postgresPassword,
      POSTGRES_INITDB_ARGS: '--auth-host=scram-sha-256',
      PGDATA: '/var/lib/postgresql/data',
    },
    redisEnv: {
      REDIS_PASSWORD: redisPassword,
    },
    minioEnv: {
      MINIO_ROOT_USER: s3AccessKey,
      MINIO_ROOT_PASSWORD: s3SecretKey,
    },
    buzzEnv: {
      BUZZ_BIND_ADDR: `0.0.0.0:${BUZZ_PORT}`,
      BUZZ_HEALTH_PORT: String(BUZZ_HEALTH_PORT),
      BUZZ_METRICS_PORT: String(BUZZ_METRICS_PORT),
      DATABASE_URL: databaseUrl,
      REDIS_URL: redisUrl,
      RELAY_URL: publicConfig.relayUrl,
      BUZZ_MEDIA_BASE_URL: publicConfig.mediaBaseUrl,
      BUZZ_CORS_ORIGINS: publicConfig.corsOrigins,
      BUZZ_S3_ENDPOINT: 'http://127.0.0.1:9000',
      BUZZ_S3_ACCESS_KEY: s3AccessKey,
      BUZZ_S3_SECRET_KEY: s3SecretKey,
      BUZZ_S3_BUCKET: S3_BUCKET,
      BUZZ_S3_REGION: 'us-east-1',
      BUZZ_GIT_REPO_PATH: '/data/git',
      BUZZ_AUTO_MIGRATE: 'false',
      BUZZ_GIT_CONFORMANCE_PROBE: 'true',
      BUZZ_REQUIRE_AUTH_TOKEN: 'true',
      BUZZ_REQUIRE_RELAY_MEMBERSHIP: 'true',
      BUZZ_ALLOW_NIP_OA_AUTH: 'true',
      BUZZ_REQUIRE_MEDIA_GET_AUTH: 'false',
      BUZZ_SERVE_GIT_WEB_GUI: 'true',
      BUZZ_PUSH_GATEWAY_DELIVERY_URL: '',
      BUZZ_MESH: 'off',
      BUZZ_MESH_DEMO_ECHO: 'off',
      BUZZ_HUDDLE_AUDIO_AVAILABLE: 'true',
      RELAY_OWNER_PUBKEY: ownerPubkeyHex,
      BUZZ_RELAY_PRIVATE_KEY: relayPrivateKeyHex,
      BUZZ_GIT_HOOK_HMAC_SECRET: gitHookHmacSecretHex,
      RUST_LOG:
        'buzz_relay=info,buzz_db=info,buzz_auth=info,buzz_pubsub=info,tower_http=info',
    },
  }
}
