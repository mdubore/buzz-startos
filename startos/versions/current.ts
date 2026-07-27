import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.2.0-main.20260726.h.7.m.57.s.31.sha.dd.222.a.5:2',
  releaseNotes: {
    en_US: 'First StartOS package of the upstream main snapshot at dd222a5.',
    es_ES:
      'Primer paquete de StartOS de la instantánea dd222a5 de la rama main del proyecto original.',
    de_DE:
      'Erstes StartOS-Paket des Snapshots dd222a5 aus dem Main-Branch des Upstream-Projekts.',
    pl_PL:
      'Pierwszy pakiet StartOS dla migawki dd222a5 z gałęzi main projektu upstream.',
    fr_FR:
      'Premier paquet StartOS de l’instantané dd222a5 de la branche main du projet amont.',
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
