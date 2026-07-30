import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.2.0-main.20260730.h.0.m.35.s.15.sha.63496.cc:0',
  releaseNotes: {
    en_US:
      'Test-only StartOS package of upstream snapshot 63496cc, including the authorization fix absent from revision :2.',
    es_ES:
      'Paquete de prueba de StartOS de la instantánea 63496cc, incluida la corrección de autorización ausente en la revisión :2.',
    de_DE:
      'StartOS-Testpaket des Snapshots 63496cc mit der in Revision :2 fehlenden Autorisierungskorrektur.',
    pl_PL:
      'Testowy pakiet StartOS migawki 63496cc z poprawką autoryzacji brakującą w wersji :2.',
    fr_FR:
      'Paquet de test StartOS de l’instantané 63496cc avec le correctif d’autorisation absent de la révision :2.',
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
