import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.2.0-main.20260730.h.0.m.35.s.15.sha.63496.cc:1',
  releaseNotes: {
    en_US:
      'Test-only StartOS package of upstream snapshot 63496cc that fixes Git-cache startup on overlay-backed Server Pure.',
    es_ES:
      'Paquete de prueba de StartOS de la instantánea 63496cc que corrige el inicio de la caché Git en Server Pure con almacenamiento overlay.',
    de_DE:
      'StartOS-Testpaket des Snapshots 63496cc, das den Start des Git-Caches auf Server Pure mit Overlay-Speicher korrigiert.',
    pl_PL:
      'Testowy pakiet StartOS migawki 63496cc, który naprawia uruchamianie pamięci podręcznej Git na Server Pure z pamięcią overlay.',
    fr_FR:
      'Paquet de test StartOS de l’instantané 63496cc qui corrige le démarrage du cache Git sur Server Pure avec stockage overlay.',
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
