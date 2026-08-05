# syntax=docker/dockerfile:1.7

FROM golang:1.26.5-alpine3.23@sha256:622e56dbc11a8cfe87cafa2331e9a201877271cbff918af53d3be315f3da88cc AS builder
RUN apk upgrade --no-cache && apk add --no-cache ca-certificates git
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -buildvcs=false -trimpath \
    -ldflags="-s -w \
      -X github.com/minio/mc/cmd.Version=RELEASE.2025-08-13T08-35-41Z \
      -X github.com/minio/mc/cmd.ReleaseTag=RELEASE.2025-08-13T08-35-41Z \
      -X github.com/minio/mc/cmd.CommitID=7394ce0dd2a80935aded936b09fa12cbb3cb8096 \
      -X github.com/minio/mc/cmd.ShortCommitID=7394ce0dd2a8" \
    -o /out/mc .

FROM alpine:3.23@sha256:fd791d74b68913cbb027c6546007b3f0d3bc45125f797758156952bc2d6daf40 AS runtime
LABEL org.opencontainers.image.title="MinIO Client for Buzz on StartOS" \
      org.opencontainers.image.description="MinIO client runtime for Buzz on StartOS" \
      org.opencontainers.image.source="https://github.com/mdubore/buzz-startos" \
      org.opencontainers.image.url="https://github.com/minio/mc" \
      org.opencontainers.image.revision="7394ce0dd2a80935aded936b09fa12cbb3cb8096" \
      org.opencontainers.image.version="RELEASE.2025-08-13T08-35-41Z" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      io.start9.buzz.upstream.source="https://github.com/minio/mc"
RUN apk upgrade --no-cache && apk add --no-cache ca-certificates
COPY --from=builder /out/mc /usr/local/bin/mc
ENTRYPOINT ["/usr/local/bin/mc"]
