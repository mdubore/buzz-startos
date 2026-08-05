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
const VERSION = '0.2.0-main.20260803.h.17.m.33.s.19.sha.651.f.637:2'
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
      /(?:remote (?:mobile|Android)(?: (?:use|pairing))?|(?:mobile|Android)(?: (?:use|pairing))? away from (?:the |your )?home network)\s+(?:is\s+)?(?:currently\s+)?(?:enabled|available|ready|supported|verified|working|works)|you\s+can\s+(?:use|pair)\s+(?:an?\s+)?(?:Android|mobile)(?:\s+(?:device|app))?\s+(?:outside|away from)\s+(?:the |your )?home network|(?:Android|mobile)(?:\s+(?:use|pairing))?\s+(?:works|is\s+(?:supported|verified|available))\s+(?:outside|away from)\s+(?:the |your )?home network/i,
    examples: [
      'Remote mobile use is supported.',
      'Remote Android pairing is enabled.',
      'Remote Android pairing is available.',
      'Remote Android pairing is ready.',
      'Remote Android pairing is currently available.',
      'You can use Android outside your home network.',
      'Android pairing works outside the home network.',
    ],
  },
  {
    name: 'positive local Android claims',
    pattern:
      /(?:unmodified\s+)?Android(?:\s+(?:application|app))?(?:\s+(?:local\s+pairing|pairing))?\s+(?:(?:is|has been)\s+)?(?:verified|supported|working|works)\b(?:\s+(?:locally|on\s+(?:the\s+)?LAN))?|(?:local\s+Android|Android\s+local)\s+pairing\s+(?:(?:is|has been)\s+)?(?:verified|supported|working|works)\b|supports?\s+(?:the\s+)?(?:unmodified\s+)?Android(?:\s+local\s+pairing)?/i,
    examples: [
      'The unmodified Android application is verified.',
      'This setup supports unmodified Android.',
      'Unmodified Android works on the LAN.',
      'Android local pairing is verified.',
      'Android pairing works locally.',
      'Local Android pairing is supported.',
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

test('upgrades from the local sideload 63496cc:2 package', () => {
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

test('mobile contradiction guards allow explicit unsupported boundaries', () => {
  const warnings = [
    'Unmodified Android remains unsupported.',
    'Android local pairing is not verified.',
    'You cannot use Android outside your home network.',
    'Remote mobile is not supported.',
  ]
  const mobileClaims = forbiddenDocumentationClaims.filter(({ name }) =>
    name.startsWith('positive'),
  )

  for (const warning of warnings) {
    for (const claim of mobileClaims) {
      assert.doesNotMatch(warning, claim.pattern)
    }
  }
})

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
  for (const document of documents) {
    assert.match(document, /native-root-aware/i)
    assert.match(document, /Buzz Desktop.*(?:and|&)\s+`?buzz-acp`?/is)
    assert.match(
      document.replace(/\s+/g, ' '),
      /current.{0,80}configuration.{0,80}unmodified Android.{0,120}rejects.{0,120}private StartOS (?:Root )?CA.{0,120}(?:secure (?:pairing|connection).{0,50}fails|fails.{0,50}secure (?:pairing|connection))/i,
    )
  }
})

test('routes volatile evidence through one stable index', async () => {
  const readme = await readFile('README.md', 'utf8')

  assert.match(readme, /\]\(docs\/EVIDENCE\.md\)/)
  assert.doesNotMatch(readme, new RegExp(UPSTREAM.shortCommit, 'i'))

  const evidence = await readFile('docs/EVIDENCE.md', 'utf8')
  const runtimePath = `upstream/${UPSTREAM.shortCommit}-startos-r2-runtime-contract.md`
  const securityPath = `security/${UPSTREAM.shortCommit}-startos-r2-runtime-scan.md`
  assert.match(
    evidence,
    new RegExp(`\\]\\(${runtimePath.replaceAll('.', '\\.')}\\)`),
  )
  assert.match(
    evidence,
    new RegExp(`\\]\\(${securityPath.replaceAll('.', '\\.')}\\)`),
  )
})

test('keeps the contributor README stable and complete', async () => {
  const readme = await readFile('README.md', 'utf8')

  const forbiddenIdentities = [
    /\bv?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?\b/,
    /\b\d+\.\d+\.\d+-main\.\S+/i,
    /\bdesktop-v\d+\.\d+\.\d+\b/i,
    /\bghcr\.io\/\S+:sha-[0-9a-f]+\b/i,
    /\bsha256:[0-9a-f]{64}\b/i,
    /\b[0-9a-f]{7,40}\b/i,
    /`[0-9a-f]{7,40}`/i,
    /github\.com\/[^\s)]+\/commit\/[0-9a-f]{7,40}/i,
    /\b(?:Start SDK|@start9labs\/start-sdk|Node\.js|Start CLI|Docker Buildx|fast-uri)\s+`?\d+\.\d+\.\d+/i,
    /^\s*(?:upstream_snapshot|package_identity|candidate_image_policy|security_status):/im,
    /github\.com\/mdubore\/buzz-startos\/releases\/(?:tag|download)\//i,
  ] as const
  for (const identity of forbiddenIdentities) {
    assert.doesNotMatch(readme, identity)
  }

  for (const source of [
    'startos/versions/current.ts',
    'startos/image-pins.ts',
    'UPDATING.md',
    'docs/EVIDENCE.md',
  ]) {
    assert.match(
      readme,
      new RegExp(`\\]\\(${source.replaceAll('.', '\\.')}\\)`),
    )
  }

  for (const action of [
    'Connection Information',
    'Configure Pairing Relay',
    'Add Member',
    'Remove Member',
    'List Members',
    'Complete Initial Setup',
    'Verify Stable State',
    'Verify Canonical URL',
  ]) {
    assert.match(readme, new RegExp(action, 'i'))
  }
  for (const volume of ['startos', 'postgres', 'redis', 'media', 'git-cache']) {
    assert.match(readme, new RegExp(`\`${volume}\``))
  }
  for (const port of [3000, 5000, 5432, 6379, 9000, 9001, 8080, 9102]) {
    assert.match(readme, new RegExp(`\`${port}\``))
  }
  for (const interfaceName of [
    'Buzz Web',
    'Buzz Relay',
    'Buzz Pairing Relay',
  ]) {
    assert.match(readme, new RegExp(interfaceName, 'i'))
  }

  assert.match(readme, /Dependencies[\s\S]{0,300}\bNone\b/i)
  assert.match(readme, /canonical URL[\s\S]{0,80}immutable/i)
  assert.match(readme, /media[\s\S]{0,100}(?:bearer|link-accessible)/i)
  assert.match(readme, /hosted[\s\S]{0,80}iOS[\s\S]{0,80}disabled/i)
  assert.match(readme, /admin[\s\S]{0,100}disabled/i)
  assert.match(readme, /full browser client[\s\S]{0,80}(?:not|no|unavailable)/i)
  assert.match(readme, /unmodified Android[\s\S]{0,160}private[\s\S]{0,80}CA/i)
  assert.match(
    readme,
    /remote mobile[\s\S]{0,120}(?:unsupported|not supported)/i,
  )
  assert.match(readme, /candidate[\s\S]{0,160}device[\s-]*test/i)
  assert.match(readme, /Redis[\s\S]{0,80}60 seconds/i)
  assert.match(readme, /pairing[\s\S]{0,80}60 seconds/i)
  assert.match(readme, /PostgreSQL[\s\S]{0,80}120 seconds/i)
  assert.match(readme, /MinIO[\s\S]{0,80}120 seconds/i)
  assert.match(readme, /Buzz[\s\S]{0,80}180 seconds/i)
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
  assert.match(
    currentContract,
    /sha256:3f8d3ff503dc735e5578e68194b1dbf543e6e792ae1c7e906c735ee269d2841c/,
  )
  assert.match(
    currentContract,
    /sha256:e47c31ff9bdd0359e25b9115e69c4a46c1f9cf3c508295d5a020fee6a8f40632/,
  )
  assert.match(
    currentContract,
    /sha256:40a76804867eb9880bec2e191dcb21c28ffae9c3e053e317199b9aaae0177688/,
  )
  assert.match(updating, new RegExp(UPSTREAM.commit))
  assert.match(updating, /desktop-v0\.5\.4/i)
  assert.match(previousContract, /63496cc/i)
  assert.match(previousContract, /00ecf2c/i)

  assert.match(readme, /downstream companion-client fork/i)
  assert.match(readme, /reproducibly rebuilt[\s\S]{0,100}upstream source/i)
  assert.match(readme, /docs\/EVIDENCE\.md/)
  assert.doesNotMatch(readme, new RegExp(UPSTREAM.shortCommit, 'i'))
  assert.match(updating, /Prepare A Reviewed Companion-Fork Update/i)
  assert.match(updating, /git switch -c .* origin\/main/i)
  assert.match(updating, /rev-parse upstream\/main/i)
  const localBaseline = updating.match(
    /The latest local sideload upgrade baseline is[\s\S]*?Neither\s+historical contract describes the candidate snapshot or downstream revision\./i,
  )
  assert.ok(localBaseline, 'missing local sideload upgrade baseline paragraph')
  assert.doesNotMatch(localBaseline[0], /\bpublished\b/i)
  assert.match(
    updating,
    /not evidence for the checked-out\s+`651f637:2` candidate/i,
  )
  assert.match(updating, /651f637` security checkpoint/i)
  assert.doesNotMatch(updating, /clean, fast-forward-only mirror/i)

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

test('records the rebuilt r2 runtime contract and publication provenance', async () => {
  const [contract, evidence] = await Promise.all([
    readFile('docs/upstream/651f637-startos-r2-runtime-contract.md', 'utf8'),
    readFile('docs/EVIDENCE.md', 'utf8'),
  ])

  assert.match(contract, new RegExp(UPSTREAM.commit))
  assert.match(contract, /Runtime Images.*31002688940/i)
  assert.match(contract, /5dd0ff1d20e3a7e1a6edb763524849ac09d3fab5/)
  assert.match(contract, /Alpine 3\.24/i)
  for (const digest of [
    '61c2c9008e3853264b3df6dbc3119ee7ba1d6278340a1780eaec0b955f2dd985',
    '169af34712fa2d8e2de95626689a2580b0b3231a780d7512322a6fb69641542a',
    '5966d41571e6a79e70ff13eda2fbcf06fec886d74a07b413c51d8c04198b823f',
    '5cff18515d059362060790bb17928a25b8b3653f5ac842a7742e9953ffa3a5d9',
    'cf33684eacfc87dbde1e2bedc24c85f85ca1dc7bc7f566b220a8b04fc38667e9',
    '3c9bb9f4ef4e50aeb875365cf405d7ea36dac0fdfd8c294daa43808783e50821',
    'b1a507ecdf3ef5272791bd3e5b66e9f6e9b73d093f3aab9a0f481fd1e729baf6',
    '4c75881d7a130597c444d9d233ad0ec41dc62e6c025374f93365e7c7fa1fbd1c',
    'c0ea7881bae5f9e0df24bda610c6fe9ed2f51504924474a0eef0a2c4ec2a1827',
  ]) {
    assert.match(contract, new RegExp(`sha256:${digest}`))
  }
  assert.match(contract, /buzz-pair-relay.*127\.0\.0\.1:5000/is)
  assert.match(contract, /Android.*private StartOS Root CA/is)
  assert.match(evidence, /upstream\/651f637-startos-r2-runtime-contract\.md/)
  assert.match(evidence, /security\/651f637-startos-r2-runtime-scan\.md/)
})
