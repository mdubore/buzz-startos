import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const repositoryFile = (path: string): string => {
  const file = new URL(`../${path}`, import.meta.url)
  assert.ok(existsSync(file), `missing runtime image source file: ${path}`)
  return readFileSync(file, 'utf8')
}

test('runtime sources are prepared from exact reviewed upstream commits', () => {
  const script = repositoryFile('scripts/prepare-runtime-image-source.sh')

  assert.match(script, /^#!\/usr\/bin\/env bash\nset -euo pipefail\n/)
  assert.match(script, /https:\/\/github\.com\/block\/buzz\.git/)
  assert.match(script, /651f6372754e60e3f936b3397040eb0f1e44c9f3/)
  assert.match(script, /https:\/\/github\.com\/minio\/minio\.git/)
  assert.match(script, /RELEASE\.2025-10-15T17-29-55Z/)
  assert.match(script, /9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a/)
  assert.match(script, /https:\/\/github\.com\/minio\/mc\.git/)
  assert.match(script, /RELEASE\.2025-08-13T08-35-41Z/)
  assert.match(script, /7394ce0dd2a80935aded936b09fa12cbb3cb8096/)
  assert.match(script, /git .*fetch .*--depth=1 .*"\$revision"/)
  assert.match(script, /git .*rev-parse HEAD/)
  assert.match(script, /actual_revision.*!=.*revision/s)
  assert.match(script, /git .*status --porcelain --untracked-files=all/)
  assert.match(script, /install -m 0644 .*go\.mod.*go\.mod/)
  assert.match(script, /install -m 0644 .*go\.sum.*go\.sum/)
  assert.match(script, /git .*diff --name-only/)
})

test('reviewed Go module patches require Go 1.26 and patched dependencies', () => {
  const minioModule = repositoryFile('images/minio/go.mod')
  const minioSums = repositoryFile('images/minio/go.sum')
  const mcModule = repositoryFile('images/mc/go.mod')
  const mcSums = repositoryFile('images/mc/go.sum')

  for (const module of [minioModule, mcModule]) {
    assert.match(module, /^go 1\.26$/m)
    assert.match(module, /golang\.org\/x\/crypto v0\.54\.0/)
    assert.match(module, /golang\.org\/x\/net v0\.57\.0/)
    assert.match(module, /google\.golang\.org\/grpc v1\.83\.0/)
  }
  assert.match(minioModule, /github\.com\/apache\/thrift v0\.24\.0/)
  assert.match(minioModule, /github\.com\/go-jose\/go-jose\/v4 v4\.1\.4/)
  assert.match(minioModule, /go\.opentelemetry\.io\/otel\/sdk v1\.45\.0/)
  assert.match(minioSums, /github\.com\/go-jose\/go-jose\/v4 v4\.1\.4 h1:/)
  assert.match(mcSums, /google\.golang\.org\/grpc v1\.83\.0 h1:/)
})

test('Buzz runtime preserves the StartOS relay contract', () => {
  const dockerfile = repositoryFile('images/buzz/Dockerfile')

  assert.match(dockerfile, /ARG RUST_VERSION=1\.95/)
  assert.match(dockerfile, /ARG NODE_VERSION=24/)
  assert.match(dockerfile, /FROM rust:.*-alpine3\.23@sha256:[a-f0-9]{64}/)
  assert.match(dockerfile, /FROM node:.*-alpine3\.24@sha256:[a-f0-9]{64}/)
  assert.match(dockerfile, /FROM alpine:3\.24@sha256:[a-f0-9]{64}/)
  assert.doesNotMatch(dockerfile, /FROM debian:/)
  assert.match(
    dockerfile,
    /cargo build --release --locked[\s\S]*buzz-relay[\s\S]*buzz-admin[\s\S]*buzz-pair-relay/,
  )
  assert.match(
    dockerfile,
    /cargo chef cook --release --recipe-path recipe\.json \\\n\s+-p buzz-relay \\\n\s+-p buzz-admin \\\n\s+-p buzz-pair-relay/,
  )
  assert.match(dockerfile, /apk upgrade --no-cache/)
  assert.match(dockerfile, /ca-certificates[\s\S]*curl[\s\S]*git[\s\S]*openssl/)
  assert.match(dockerfile, /EXPOSE 3000 8080 9102/)
  assert.match(dockerfile, /mkdir -p \/data\/git/)
  assert.match(dockerfile, /adduser[\s\S]*-u 1000/)
  assert.match(dockerfile, /USER buzz:buzz/)
  assert.match(dockerfile, /ENTRYPOINT \["\/usr\/local\/bin\/buzz-relay"\]/)
})

test('MinIO and MC build native static binaries into minimal runtimes', () => {
  const minio = repositoryFile('images/minio/Dockerfile')
  const mc = repositoryFile('images/mc/Dockerfile')

  for (const dockerfile of [minio, mc]) {
    assert.match(
      dockerfile,
      /FROM golang:1\.26\.5-.*@sha256:[a-f0-9]{64} AS builder/,
    )
    assert.match(dockerfile, /FROM alpine:3\.24@sha256:[a-f0-9]{64}/)
    assert.match(dockerfile, /CGO_ENABLED=0 go build/)
    assert.match(dockerfile, /-buildvcs=false/)
    assert.match(dockerfile, /-trimpath/)
    assert.match(dockerfile, /apk upgrade --no-cache/)
    assert.match(dockerfile, /ca-certificates/)
  }

  assert.match(minio, /apk add --no-cache[\s\\]*ca-certificates[\s\\]*curl/)
  assert.match(minio, /VOLUME \["\/data"\]/)
  assert.match(minio, /EXPOSE 9000 9001/)
  assert.match(minio, /ENTRYPOINT \["\/usr\/local\/bin\/minio"\]/)
  assert.match(
    minio,
    /github\.com\/minio\/minio\/cmd\.ReleaseTag=RELEASE\.2025-10-15T17-29-55Z/,
  )
  assert.match(
    minio,
    /github\.com\/minio\/minio\/cmd\.CommitID=9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a/,
  )
  assert.match(mc, /COPY --from=builder \/out\/mc \/usr\/local\/bin\/mc/)
  assert.match(mc, /ENTRYPOINT \["\/usr\/local\/bin\/mc"\]/)
  assert.match(
    mc,
    /github\.com\/minio\/mc\/cmd\.ReleaseTag=RELEASE\.2025-08-13T08-35-41Z/,
  )
  assert.match(
    mc,
    /github\.com\/minio\/mc\/cmd\.CommitID=7394ce0dd2a80935aded936b09fa12cbb3cb8096/,
  )
})

test('runtime image documentation binds source, patches, and licenses', () => {
  const documentation = repositoryFile('images/README.md')

  assert.match(documentation, /651f6372754e60e3f936b3397040eb0f1e44c9f3/)
  assert.match(documentation, /9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a/)
  assert.match(documentation, /7394ce0dd2a80935aded936b09fa12cbb3cb8096/)
  assert.match(documentation, /Apache-2\.0/)
  assert.match(documentation, /AGPL-3\.0/)
  assert.match(documentation, /prepare-runtime-image-source\.sh/)
})
