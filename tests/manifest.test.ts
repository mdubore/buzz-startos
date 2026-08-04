import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { ExtendedVersion, IMPOSSIBLE } from '@start9labs/start-sdk'

import defaultDict from '../startos/i18n/dictionaries/default.js'
import translations from '../startos/i18n/dictionaries/translations.js'
import {
  IMAGE_PINS,
  UPSTREAM,
  packedImageReference,
} from '../startos/image-pins.js'
import { manifest } from '../startos/manifest/index.js'
import { current } from '../startos/versions/current.js'
import { versionGraph } from '../startos/versions/index.js'

const PREVIOUS_VERSION = '0.2.0-main.20260730.h.0.m.35.s.15.sha.63496.cc:2'
const VERSION = '0.2.0-main.20260803.h.17.m.33.s.19.sha.651.f.637:0'
const ARCHES = ['x86_64', 'aarch64']
const IMMUTABLE_IMAGE = /@sha256:[0-9a-f]{64}$/
const PLACEHOLDER = new RegExp(
  `${['REPLACE', 'ME'].join('_')}|TODO:|\\{\\{(?:${['id', 'name'].join(
    '|',
  )})\\}\\}`,
)

const forbiddenDocumentationClaims = [
  {
    name: 'manual /pair URL instructions',
    pattern:
      /\b(?:(?:append|add)\s+`?\/pair`?\s+to\s+(?:the\s+)?(?:pairing|main)(?: relay)? URL|(?:select|choose|configure)\s+`?\/pair`?(?:\s+manually)?\s+(?:for|on|as)\s+(?:the\s+)?(?:pairing|main)(?: relay)? URL|(?:set|select|choose|configure)\s+(?:the\s+)?(?:pairing|main)(?: relay)? URL\s+(?:to|as)\s+`?\/pair`?)/i,
    examples: [
      'Add `/pair` to the main relay URL.',
      'Append /pair to the pairing relay URL.',
      'Select `/pair` manually for the pairing relay URL.',
      'Configure /pair on the main relay URL.',
      'Choose `/pair` for the pairing relay URL.',
      'Set the main relay URL to `/pair`.',
      'Configure the pairing relay URL as `/pair`.',
    ],
  },
  {
    name: 'positive remote mobile claims',
    pattern:
      /(?:remote (?:mobile|Android)(?: (?:use|pairing))?|(?:mobile|Android)(?: (?:use|pairing))? away from (?:the |your )?home network)\s+(?:is\s+)?(?:currently\s+)?(?:enabled|available|ready|supported|verified|working|works)/i,
    examples: [
      'Remote mobile use is supported.',
      'Remote Android pairing is enabled.',
      'Remote Android pairing is available.',
      'Remote Android pairing is ready.',
      'Remote Android pairing is currently available.',
    ],
  },
  {
    name: 'positive unmodified Android claims',
    pattern:
      /unmodified Android(?: application| app)?\s+(?:is|has been)\s+(?:verified|supported)|supports? (?:the )?unmodified Android/i,
    examples: [
      'The unmodified Android application is verified.',
      'This setup supports unmodified Android.',
    ],
  },
  {
    name: 'required long-term mobile modifications',
    pattern:
      /(?:must|required to|needs? to)\s+(?:be\s+)?(?:modify|patch|change)[a-z]*.{0,30}(?:Android|mobile)|(?:Android|mobile).{0,30}(?:(?:modification|patch).{0,20}(?:is|required|needed)|must\s+be\s+(?:modified|patched|changed)).{0,20}(?:long[- ]term|permanent)/i,
    examples: [
      'You must modify the mobile app permanently.',
      'Android app modification is required long-term.',
    ],
  },
] as const

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

test('uses the audited 651f637 snapshot as the current package version', () => {
  assert.equal(current.options.version, VERSION)
  assert.equal(versionGraph.currentVersion().toString(), VERSION)
  assert.equal(UPSTREAM.commit, '651f6372754e60e3f936b3397040eb0f1e44c9f3')
  assert.equal(UPSTREAM.shortCommit, '651f637')
  assert.equal(UPSTREAM.committedAt, '2026-08-03T17:33:19Z')
  assert.equal(UPSTREAM.relayVersion, '0.2.0')
  assert.deepEqual(Object.keys(current.options.releaseNotes).sort(), [
    'de_DE',
    'en_US',
    'es_ES',
    'fr_FR',
    'pl_PL',
  ])
  assert.equal(typeof current.options.migrations.up, 'function')
  assert.equal(current.options.migrations.down, IMPOSSIBLE)
  assert.equal(typeof current.options.releaseNotes, 'object')
  if (typeof current.options.releaseNotes === 'string') {
    throw new Error('release notes must be localized')
  }
  assert.match(current.options.releaseNotes.en_US, /Desktop v0\.5\.4/i)
  assert.match(current.options.releaseNotes.en_US, /NIP-11/i)
  assert.match(current.options.releaseNotes.en_US, /Git/i)
  assert.match(current.options.releaseNotes.en_US, /security/i)
  assert.match(current.options.releaseNotes.en_US, /dedicated.*pairing relay/i)
  assert.match(current.options.releaseNotes.en_US, /LAN-only/i)
  assert.match(current.options.releaseNotes.en_US, /does not enable remote/i)
  for (const releaseNote of Object.values(current.options.releaseNotes)) {
    assert.match(
      releaseNote,
      /https:\/\/github\.com\/block\/buzz\/releases\/tag\/desktop-v0\.5\.4/,
    )
  }
})

test('upgrades from the published local 63496cc:2 package', () => {
  const previous = ExtendedVersion.parse(PREVIOUS_VERSION)
  const next = versionGraph.currentVersion()

  assert.equal(previous.compareForSort(next) < 0, true)
  assert.equal(previous.satisfies(versionGraph.canMigrateFrom()), true)
  assert.equal(next.satisfies(versionGraph.canMigrateTo()), true)
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

for (const forbiddenClaim of forbiddenDocumentationClaims) {
  test(`detects ${forbiddenClaim.name}`, () => {
    for (const example of forbiddenClaim.examples) {
      assert.match(
        example,
        forbiddenClaim.pattern,
        `${forbiddenClaim.name} detector missed: ${example}`,
      )
    }
  })
}

test('documents the LAN-only mobile pairing beta boundary', async () => {
  const documents = await Promise.all(
    ['README.md', 'instructions.md'].map((path) => readFile(path, 'utf8')),
  )

  for (const document of documents) {
    const normalized = document.replace(/\s+/g, ' ')

    assert.match(normalized, /LAN-only/i)
    assert.match(normalized, /does not (?:enable|provide).*remote access/i)
    assert.match(normalized, /main(?: Buzz)? relay.*\/pair.*404/is)
    assert.match(
      normalized,
      /pairing_relay_url.*dedicated root|dedicated root.*NIP-11/is,
    )
    assert.match(normalized, /Android.*TLS|TLS.*Android/is)
    assert.match(normalized, /StartTunnel.*future|future.*StartTunnel/is)
    assert.match(
      normalized,
      /without (?:a )?Buzz client modification|requires no Buzz client modification/i,
    )
    for (const forbiddenClaim of forbiddenDocumentationClaims) {
      assert.doesNotMatch(
        normalized,
        forbiddenClaim.pattern,
        `documentation contains ${forbiddenClaim.name}`,
      )
    }
  }

  assert.match(documents[0], /BUZZ_PAIRING_RELAY_URL/)
  assert.match(documents[0], /internal port\s+`5000`/i)
  assert.match(documents[1], /mdubore\/buzz9/)
  assert.match(documents[1], /78a155f92/)
  assert.match(documents[1], /b953803bc/)
  assert.match(documents[1], /4ac56fce1/)
})

test('documents audited 651f637 provenance and historical snapshot scope', async () => {
  const [
    readme,
    updating,
    currentContract,
    previousContract,
    historicalContract,
  ] = await Promise.all(
    [
      'README.md',
      'UPDATING.md',
      'docs/upstream/651f637-runtime-contract.md',
      'docs/upstream/63496cc-runtime-contract.md',
      'docs/upstream/dd222a5-runtime-contract.md',
    ].map((path) => readFile(path, 'utf8')),
  )

  assert.match(currentContract, new RegExp(UPSTREAM.commit))
  assert.match(currentContract, /desktop-v0\.5\.4/i)
  assert.match(currentContract, new RegExp(IMAGE_PINS.buzz.indexDigest))
  assert.match(currentContract, new RegExp(IMAGE_PINS.buzz.platforms.amd64))
  assert.match(currentContract, new RegExp(IMAGE_PINS.buzz.platforms.arm64))
  assert.match(updating, new RegExp(UPSTREAM.commit))
  assert.match(updating, /desktop-v0\.5\.4/i)
  assert.match(previousContract, /63496cc/i)
  assert.match(previousContract, /00ecf2c/i)

  const provenanceDocumentation = `${readme}\n${updating}`
  assert.match(readme, /downstream companion-client fork/i)
  assert.match(readme, /official `block\/buzz` image pins/i)
  assert.match(updating, /Prepare A Reviewed Companion-Fork Update/i)
  assert.match(updating, /git switch -c .* origin\/main/i)
  assert.match(updating, /rev-parse upstream\/main/i)
  assert.match(updating, /historical image was blocked/i)
  assert.match(updating, /not evidence for the current\s+`63496cc:2` package/i)
  assert.doesNotMatch(
    provenanceDocumentation,
    /clean, fast-forward-only mirror|existing Buzz image|newer candidate/i,
  )

  assert.match(
    currentContract,
    /executable `\/usr\/local\/bin\/buzz-pair-relay`/i,
  )
  assert.match(currentContract, /BUZZ_PAIRING_RELAY_URL/)
  assert.match(currentContract, /NIP-11.*advertise.*exact root URL/is)
  assert.match(currentContract, /prepare-git-cache.*may start in parallel/is)
  assert.match(
    currentContract,
    /migrate.*waits for.*PostgreSQL.*bucket creation.*Git-cache/is,
  )
  assert.match(
    currentContract,
    /startup, schema, storage, and health contract/i,
  )
  assert.match(historicalContract, /Historical status: superseded/i)
  assert.match(historicalContract, /does not describe the current/i)
})
