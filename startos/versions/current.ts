import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.2.0-main.20260803.h.17.m.33.s.19.sha.651.f.637:0',
  releaseNotes: {
    en_US:
      'Updates the bundled server snapshot released with Buzz Desktop v0.5.4, including corrected NIP-11 limits and workspace-icon handling, multi-repository projects, safer Git default-branch deletion, and upstream security dependency fixes. Retains the dedicated LAN-only pairing relay; this package does not enable remote mobile access. [Complete Buzz Desktop v0.5.4 release notes](https://github.com/block/buzz/releases/tag/desktop-v0.5.4).',
    es_ES:
      'Actualiza la instantánea del servidor incluida con Buzz Desktop v0.5.4 e incorpora límites NIP-11 y manejo del icono del espacio de trabajo corregidos, proyectos con varios repositorios, una eliminación más segura de la rama Git predeterminada y correcciones de seguridad en dependencias. Conserva el relay de emparejamiento dedicado solo a la red local; este paquete no habilita el acceso móvil remoto. [Notas completas de Buzz Desktop v0.5.4](https://github.com/block/buzz/releases/tag/desktop-v0.5.4).',
    de_DE:
      'Aktualisiert den mit Buzz Desktop v0.5.4 veröffentlichten Serverstand mit korrigierten NIP-11-Limits und Arbeitsbereichssymbolen, Projekten mit mehreren Repositorys, sichererem Löschen des Git-Standardzweigs und Sicherheitskorrekturen für Abhängigkeiten. Das dedizierte Kopplungs-Relay bleibt auf das lokale Netzwerk beschränkt; dieses Paket aktiviert keinen mobilen Fernzugriff. [Vollständige Versionshinweise zu Buzz Desktop v0.5.4](https://github.com/block/buzz/releases/tag/desktop-v0.5.4).',
    pl_PL:
      'Aktualizuje migawkę serwera wydaną z Buzz Desktop v0.5.4, dodając poprawione limity NIP-11 i obsługę ikony obszaru roboczego, projekty z wieloma repozytoriami, bezpieczniejsze usuwanie domyślnej gałęzi Git oraz poprawki bezpieczeństwa zależności. Zachowuje dedykowany przekaźnik parowania działający wyłącznie w sieci lokalnej; ten pakiet nie włącza zdalnego dostępu mobilnego. [Pełne informacje o wydaniu Buzz Desktop v0.5.4](https://github.com/block/buzz/releases/tag/desktop-v0.5.4).',
    fr_FR:
      'Met à jour l’instantané du serveur publié avec Buzz Desktop v0.5.4, avec des limites NIP-11 et une gestion de l’icône de l’espace de travail corrigées, les projets à plusieurs dépôts, une suppression plus sûre de la branche Git par défaut et des correctifs de sécurité des dépendances. Conserve le relais d’appairage dédié au réseau local ; ce paquet n’active pas l’accès mobile distant. [Notes de publication complètes de Buzz Desktop v0.5.4](https://github.com/block/buzz/releases/tag/desktop-v0.5.4).',
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
