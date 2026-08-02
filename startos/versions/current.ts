import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.2.0-main.20260730.h.0.m.35.s.15.sha.63496.cc:2',
  releaseNotes: {
    en_US:
      'Combines the overlay-compatible recursive Git-cache startup fix with a dedicated LAN-only pairing relay; this package does not enable remote mobile access.',
    es_ES:
      'Combina la corrección recursiva de inicio de la caché Git compatible con almacenamiento overlay con un relay de emparejamiento dedicado solo a la red local; este paquete no habilita el acceso móvil remoto.',
    de_DE:
      'Kombiniert die rekursive, Overlay-kompatible Startkorrektur für den Git-Cache mit einem dedizierten Kopplungs-Relay nur für das lokale Netzwerk; dieses Paket aktiviert keinen mobilen Fernzugriff.',
    pl_PL:
      'Łączy rekurencyjną, zgodną z pamięcią overlay poprawkę uruchamiania pamięci podręcznej Git z dedykowanym przekaźnikiem parowania wyłącznie w sieci lokalnej; ten pakiet nie włącza zdalnego dostępu mobilnego.',
    fr_FR:
      'Combine le correctif récursif de démarrage du cache Git compatible avec le stockage overlay et un relais d’appairage dédié au réseau local ; ce paquet n’active pas l’accès mobile distant.',
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
