import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.2.0-main.20260726.h.7.m.57.s.31.sha.dd.222.a.5:3',
  releaseNotes: {
    en_US:
      'Adds a dedicated LAN-only pairing relay beta for mobile device setup; this package does not enable remote mobile access.',
    es_ES:
      'Añade una beta del relay de emparejamiento dedicada solo a la red local para configurar dispositivos móviles; este paquete no habilita el acceso móvil remoto.',
    de_DE:
      'Fügt eine Beta des dedizierten Kopplungs-Relays nur für das lokale Netzwerk zur Einrichtung mobiler Geräte hinzu; dieses Paket aktiviert keinen mobilen Fernzugriff.',
    pl_PL:
      'Dodaje wersję beta dedykowanego przekaźnika parowania wyłącznie w sieci lokalnej do konfiguracji urządzeń mobilnych; ten pakiet nie włącza zdalnego dostępu mobilnego.',
    fr_FR:
      'Ajoute une version bêta du relais d’appairage dédié au réseau local pour configurer les appareils mobiles ; ce paquet n’active pas l’accès mobile distant.',
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
