export const HOST_ID = 'buzz'
export const WEB_INTERFACE_ID = 'web'
export const RELAY_INTERFACE_ID = 'relay'
export const PAIRING_HOST_ID = 'buzz-pairing'
export const PAIRING_INTERFACE_ID = 'pairing-relay'

export const BUZZ_PORT = 3000
export const PAIRING_PORT = 5000
export const BUZZ_HEALTH_PORT = 8080
export const BUZZ_METRICS_PORT = 9102

export const POSTGRES_DB = 'buzz'
export const POSTGRES_USER = 'buzz'
export const POSTGRES_MOUNTPOINT = '/var/lib/postgresql'
export const POSTGRES_DATA_PATH = '/data'

export const S3_BUCKET = 'buzz-media'

export const SETUP_TASK_REPLAY_ID = 'buzz:complete-initial-setup'
export const STATE_RECOVERY_TASK_REPLAY_ID = 'buzz:verify-stable-state'
export const URL_RECOVERY_TASK_REPLAY_ID = 'buzz:verify-canonical-url'
export const PAIRING_SETUP_TASK_REPLAY_ID = 'buzz:configure-pairing-relay'
