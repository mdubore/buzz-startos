import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { IMPOSSIBLE } from '@start9labs/start-sdk'

import defaultDict from '../startos/i18n/dictionaries/default.js'
import translations from '../startos/i18n/dictionaries/translations.js'
import { IMAGE_PINS, packedImageReference } from '../startos/image-pins.js'
import { manifest } from '../startos/manifest/index.js'
import { current } from '../startos/versions/current.js'
import { versionGraph } from '../startos/versions/index.js'

const VERSION = '0.2.0-main.20260726.h.7.m.57.s.31.sha.dd.222.a.5:2'
const ARCHES = ['x86_64', 'aarch64']
const IMMUTABLE_IMAGE = /@sha256:[0-9a-f]{64}$/
const PLACEHOLDER = new RegExp(
  `${['REPLACE', 'ME'].join('_')}|TODO:|\\{\\{(?:${['id', 'name'].join(
    '|',
  )})\\}\\}`,
)

const expectedImages = {
  buzz: {
    source: { dockerTag: packedImageReference(IMAGE_PINS.buzz) },
    arch: ARCHES,
  },
  postgres: {
    source: { dockerTag: packedImageReference(IMAGE_PINS.postgres) },
    arch: ARCHES,
  },
  redis: {
    source: { dockerTag: packedImageReference(IMAGE_PINS.redis) },
    arch: ARCHES,
  },
  minio: {
    source: { dockerTag: packedImageReference(IMAGE_PINS.minio) },
    arch: ARCHES,
  },
  'minio-client': {
    source: { dockerTag: packedImageReference(IMAGE_PINS.minioClient) },
    arch: ARCHES,
  },
}

test('defines the Buzz package identity and storage contract', () => {
  assert.equal(manifest.id, 'buzz')
  assert.equal(manifest.title, 'Buzz')
  assert.equal(manifest.license, 'Apache-2.0')
  assert.equal(manifest.packageRepo, 'https://github.com/mdubore/buzz-startos')
  assert.equal(manifest.upstreamRepo, 'https://github.com/block/buzz')
  assert.equal(manifest.marketingUrl, 'https://github.com/block/buzz')
  assert.equal(manifest.donationUrl, null)
  assert.deepEqual(manifest.volumes, [
    'startos',
    'postgres',
    'redis',
    'media',
    'git-cache',
  ])
  assert.deepEqual(manifest.dependencies, {})
  assert.equal('hardwareRequirements' in manifest, false)
})

test('packs every runtime image from its immutable verified pin', () => {
  assert.deepEqual(manifest.images, expectedImages)

  for (const image of Object.values(manifest.images)) {
    assert.deepEqual(image.arch, ARCHES)
    assert.equal('dockerTag' in image.source, true)
    if ('dockerTag' in image.source) {
      assert.match(image.source.dockerTag, IMMUTABLE_IMAGE)
    }
  }
})

test('uses the audited upstream-main snapshot as the initial package version', () => {
  assert.equal(current.options.version, VERSION)
  assert.equal(versionGraph.currentVersion().toString(), VERSION)
  assert.deepEqual(Object.keys(current.options.releaseNotes).sort(), [
    'de_DE',
    'en_US',
    'es_ES',
    'fr_FR',
    'pl_PL',
  ])
  assert.equal(typeof current.options.migrations.up, 'function')
  assert.equal(current.options.migrations.down, IMPOSSIBLE)
})

test('localizes package descriptions without scaffold placeholders', () => {
  assert.equal(
    manifest.description.short.en_US,
    'A self-hosted workspace relay for people and AI agents',
  )
  assert.equal(
    manifest.description.long.en_US,
    'Buzz combines Nostr-signed collaboration, channels, media, workflows, and Git hosting. This package runs the relay backend. The desktop client provides the full experience; mobile clients are still under development.',
  )
  assert.doesNotMatch(
    manifest.description.long.en_US,
    /desktop or mobile clients provide the full experience/i,
  )
  assert.equal(
    manifest.description.long.es_ES,
    'Buzz combina colaboración firmada con Nostr, canales, contenido multimedia, flujos de trabajo y alojamiento Git. Este paquete ejecuta el backend del relay. El cliente de escritorio ofrece la experiencia completa; los clientes móviles aún están en desarrollo.',
  )
  assert.equal(
    manifest.description.long.de_DE,
    'Buzz vereint Nostr-signierte Zusammenarbeit, Kanäle, Medien, Workflows und Git-Hosting. Dieses Paket betreibt das Relay-Backend. Der Desktop-Client bietet das vollständige Erlebnis; die Mobil-Clients befinden sich noch in Entwicklung.',
  )
  assert.equal(
    manifest.description.long.pl_PL,
    'Buzz łączy współpracę podpisywaną w Nostr, kanały, multimedia, przepływy pracy i hosting Git. Ten pakiet uruchamia zaplecze przekaźnika. Klient komputerowy zapewnia pełne możliwości; klienty mobilne są nadal w fazie rozwoju.',
  )
  assert.equal(
    manifest.description.long.fr_FR,
    'Buzz réunit la collaboration signée avec Nostr, les canaux, les médias, les flux de travail et l’hébergement Git. Ce paquet exécute le backend du relais. Le client de bureau offre l’expérience complète ; les clients mobiles sont encore en cours de développement.',
  )

  for (const descriptions of [
    manifest.description.short,
    manifest.description.long,
  ]) {
    assert.deepEqual(Object.keys(descriptions).sort(), [
      'de_DE',
      'en_US',
      'es_ES',
      'fr_FR',
      'pl_PL',
    ])
    for (const value of Object.values(descriptions)) {
      assert.equal(value.trim().length > 0, true)
      assert.doesNotMatch(value, PLACEHOLDER)
    }
  }
})

test('prepares localized UI strings for setup, recovery, access, and health', () => {
  const requiredKeys = [
    'Buzz Web',
    "Browser access to Buzz's HTTP interface.",
    'Buzz Relay',
    'WebSocket relay endpoint for Buzz clients.',
    'Complete Initial Setup',
    'Set and validate the immutable owner identity and canonical StartOS URL for this Buzz community.',
    'Owner Nostr Public Key',
    'Enter an npub or 64-character hexadecimal Nostr public key.',
    'Canonical Web URL',
    'Select the StartOS URL that will permanently identify this Buzz community.',
    'Initial Setup Complete',
    'Relay WebSocket URL',
    'Verify Stable State',
    'Verify restored Buzz state after recovering it from a known-good backup.',
    'Verify Canonical URL',
    'Verify that the original immutable StartOS address is available after a restore or gateway change.',
    'Connection Information',
    'Show the canonical, relay, and pairing addresses and owner public key used by external Buzz clients.',
    'Buzz Connection Information',
    'Normal mobile traffic uses the main relay. Use the pairing relay only when adding a device. The current verified beta configuration is LAN-only.',
    'Owner Public Key (Hex)',
    'Buzz stored state requires recovery. Restore a known-good StartOS backup or reset and reinstall Buzz.',
    'Complete initial setup before starting Buzz.',
    'The original canonical URL is unavailable. Restore that same StartOS address before starting Buzz.',
    'Buzz Relay is ready',
    'Buzz Relay is not ready',
    'Add Member',
    'Add a member or administrator role to a Nostr identity in the private relay.',
    'Remove Member',
    'Remove a member or administrator role from a Nostr identity in the private relay.',
    'List Members',
    'Display the private relay roster.',
    'Nostr Public Key',
    'Role',
    'Choose whether this identity is a member or administrator.',
    'Member',
    'Administrator',
    'Member Added',
    'Member Removed',
    'Normalized Nostr Public Key',
    'Relay Members',
    'Buzz Pairing Relay',
    'Ephemeral WebSocket endpoint for pairing Buzz devices.',
    'Pairing Relay WebSocket URL',
    'Select the StartOS WebSocket address Buzz will advertise for device pairing.',
    'Configure Pairing Relay',
    'Select the current StartOS WebSocket address used to pair Buzz devices.',
    'Pairing Relay Configured',
    'Select a WebSocket address currently available on the Buzz pairing interface before starting Buzz.',
    'Buzz Pairing Relay is ready',
    'Buzz Pairing Relay is not ready',
  ] as const

  assert.deepEqual(Object.keys(defaultDict), requiredKeys)
  assert.deepEqual(
    Object.values(defaultDict),
    requiredKeys.map((_, index) => index),
  )
  assert.equal(new Set(Object.values(defaultDict)).size, requiredKeys.length)
  assert.deepEqual(Object.keys(translations).sort(), [
    'de_DE',
    'es_ES',
    'fr_FR',
    'pl_PL',
  ])

  for (const translation of Object.values(translations)) {
    assert.deepEqual(
      Object.keys(translation).map(Number),
      requiredKeys.map((_, index) => index),
    )
    for (const value of Object.values(translation)) {
      assert.equal(value.trim().length > 0, true)
      assert.doesNotMatch(value, PLACEHOLDER)
    }
  }

  assert.equal(
    translations.es_ES[19],
    'El tráfico móvil normal usa el relay principal. Usa el relay de emparejamiento solo al añadir un dispositivo. La configuración beta verificada actual funciona solo en la red local.',
  )
  assert.equal(
    translations.de_DE[13],
    'Prüfe den aus einer gültigen Sicherung wiederhergestellten Buzz-Zustand.',
  )
  assert.equal(
    translations.de_DE[17],
    'Zeigt die kanonische Adresse, die Relay- und Kopplungsadressen sowie den öffentlichen Schlüssel des Eigentümers für externe Buzz-Clients.',
  )
  assert.equal(
    translations.de_DE[19],
    'Normaler mobiler Datenverkehr nutzt das Haupt-Relay. Verwenden Sie das Kopplungs-Relay nur beim Hinzufügen eines Geräts. Die derzeit verifizierte Beta-Konfiguration funktioniert nur im lokalen Netzwerk.',
  )
  assert.equal(
    translations.de_DE[20],
    'Öffentlicher Schlüssel des Eigentümers (Hex)',
  )
  assert.equal(
    translations.pl_PL[8],
    'Kanoniczny adres URL interfejsu webowego',
  )
  assert.equal(
    translations.pl_PL[19],
    'Zwykły ruch mobilny korzysta z głównego przekaźnika. Przekaźnika parowania używaj tylko podczas dodawania urządzenia. Obecnie zweryfikowana konfiguracja beta działa wyłącznie w sieci lokalnej.',
  )
  assert.equal(
    translations.fr_FR[19],
    'Le trafic mobile normal utilise le relais principal. Utilisez le relais d’appairage uniquement lors de l’ajout d’un appareil. La configuration bêta actuellement vérifiée fonctionne uniquement sur le réseau local.',
  )
})

test('documents the exact LAN-only mobile pairing beta boundary', async () => {
  const documents = await Promise.all(
    ['README.md', 'instructions.md'].map((path) => readFile(path, 'utf8')),
  )

  for (const document of documents) {
    assert.match(document, /current verified beta configuration is LAN-only/i)
    assert.match(document, /does not enable remote access/i)
    assert.match(document, /unmodified Android/i)
    assert.match(document, /StartOS Root CA/i)
    assert.match(document, /StartTunnel/i)
    assert.match(document, /\/pair.*404|404.*\/pair/is)
    assert.match(document, /stateless/i)
    assert.match(document, /normal mobile\s+traffic.*main relay/is)
  }
})
