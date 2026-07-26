import { i18n } from '../i18n/index.js'

export const BUZZ_READINESS_URL = 'http://127.0.0.1:8080/_readiness'
export const MINIO_LIVENESS_URL = 'http://127.0.0.1:9000/minio/health/live'
export const MINIO_READINESS_URL = 'http://127.0.0.1:9000/minio/health/ready'

export type HealthProbe = (url: string) => Promise<boolean>

export async function checkCompositeHealth(probe: HealthProbe) {
  try {
    const [buzzReady, minioLive] = await Promise.all([
      probe(BUZZ_READINESS_URL),
      probe(MINIO_LIVENESS_URL),
    ])

    if (buzzReady && minioLive) {
      return {
        result: 'success' as const,
        message: i18n('Buzz Relay is ready'),
      }
    }
  } catch {
    // Probe details may contain credentials; expose only a fixed result.
  }

  return {
    result: 'failure' as const,
    message: i18n('Buzz Relay is not ready'),
  }
}
