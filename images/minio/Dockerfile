# syntax=docker/dockerfile:1.7

FROM golang:1.26.5-alpine3.23@sha256:622e56dbc11a8cfe87cafa2331e9a201877271cbff918af53d3be315f3da88cc AS builder
RUN apk upgrade --no-cache && apk add --no-cache ca-certificates git
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -buildvcs=false -trimpath -tags kqueue \
    -ldflags="-s -w \
      -X github.com/minio/minio/cmd.Version=RELEASE.2025-10-15T17-29-55Z \
      -X github.com/minio/minio/cmd.ReleaseTag=RELEASE.2025-10-15T17-29-55Z \
      -X github.com/minio/minio/cmd.CommitID=9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a \
      -X github.com/minio/minio/cmd.ShortCommitID=9e49d5e7a648" \
    -o /out/minio .

FROM alpine:3.24@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b AS runtime
LABEL org.opencontainers.image.title="MinIO for Buzz on StartOS" \
      org.opencontainers.image.description="MinIO object storage runtime for Buzz on StartOS" \
      org.opencontainers.image.source="https://github.com/mdubore/buzz-startos" \
      org.opencontainers.image.url="https://github.com/minio/minio" \
      org.opencontainers.image.revision="9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a" \
      org.opencontainers.image.version="RELEASE.2025-10-15T17-29-55Z" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      io.start9.buzz.upstream.source="https://github.com/minio/minio"
RUN apk upgrade --no-cache \
    && apk add --no-cache \
        ca-certificates \
        curl
COPY --from=builder /out/minio /usr/local/bin/minio
VOLUME ["/data"]
EXPOSE 9000 9001
ENTRYPOINT ["/usr/local/bin/minio"]
