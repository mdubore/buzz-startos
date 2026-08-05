# syntax=docker/dockerfile:1.7

ARG RUST_VERSION=1.95
ARG NODE_VERSION=24

FROM rust:${RUST_VERSION}-alpine3.23@sha256:606fd313a0f49743ee2a7bd49a0914bab7deedb12791f3a846a34a4711db7ed2 AS chef
RUN apk upgrade --no-cache \
    && apk add --no-cache \
        build-base \
        ca-certificates \
        git \
        openssl-dev \
        pkgconf \
    && cargo install cargo-chef --locked --version 0.1.71
WORKDIR /build

FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /build/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json \
    -p buzz-relay \
    -p buzz-admin \
    -p buzz-pair-relay
COPY . .
RUN cargo build --release --locked -p buzz-relay --bin buzz-relay \
                                   -p buzz-admin --bin buzz-admin \
                                   -p buzz-pair-relay --bin buzz-pair-relay \
    && strip target/release/buzz-relay \
             target/release/buzz-admin \
             target/release/buzz-pair-relay

FROM node:${NODE_VERSION}-alpine3.24@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS web-builder
WORKDIR /build
RUN apk upgrade --no-cache \
    && apk add --no-cache ca-certificates \
    && corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches/ patches/
COPY web/package.json web/
COPY admin-web/package.json admin-web/
RUN pnpm install --frozen-lockfile --filter buzz-web --filter buzz-admin-web
COPY web/ web/
COPY admin-web/ admin-web/
RUN pnpm -C web build && pnpm -C admin-web build

FROM alpine:3.24@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b AS runtime
LABEL org.opencontainers.image.title="Buzz for StartOS" \
      org.opencontainers.image.description="Buzz relay runtime for the StartOS package" \
      org.opencontainers.image.source="https://github.com/mdubore/buzz-startos" \
      org.opencontainers.image.url="https://github.com/block/buzz" \
      org.opencontainers.image.revision="651f6372754e60e3f936b3397040eb0f1e44c9f3" \
      org.opencontainers.image.licenses="Apache-2.0" \
      io.start9.buzz.upstream.source="https://github.com/block/buzz"
RUN apk upgrade --no-cache \
    && apk add --no-cache \
        ca-certificates \
        curl \
        git \
        openssl \
    && addgroup -S -g 1000 buzz \
    && adduser -S -D -u 1000 -G buzz -h /var/lib/buzz \
        -s /sbin/nologin buzz \
    && mkdir -p /data/git \
    && chown buzz:buzz /data/git
COPY --from=web-builder /build/web/dist /srv/buzz/web
COPY --from=web-builder /build/admin-web/dist /srv/buzz/admin-web
COPY --from=builder /build/target/release/buzz-relay /usr/local/bin/buzz-relay
COPY --from=builder /build/target/release/buzz-admin /usr/local/bin/buzz-admin
COPY --from=builder /build/target/release/buzz-pair-relay /usr/local/bin/buzz-pair-relay
ENV BUZZ_WEB_DIR=/srv/buzz/web \
    BUZZ_ADMIN_WEB_DIR=/srv/buzz/admin-web
EXPOSE 3000 8080 9102
USER buzz:buzz
WORKDIR /var/lib/buzz
ENTRYPOINT ["/usr/local/bin/buzz-relay"]
