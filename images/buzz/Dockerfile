# syntax=docker/dockerfile:1.7

ARG RUST_VERSION=1.95
ARG NODE_VERSION=24
ARG DEBIAN_VERSION=trixie

FROM rust:${RUST_VERSION}-${DEBIAN_VERSION}@sha256:f49565f188ee00bc2a18dd418183f2c5f23ef7d6e691890517ed341a598f67c3 AS chef
RUN cargo install cargo-chef --locked --version 0.1.71
WORKDIR /build

FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        pkg-config \
        libssl-dev \
        ca-certificates \
        git \
    && rm -rf /var/lib/apt/lists/*
COPY --from=planner /build/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json
COPY . .
RUN cargo build --release --locked -p buzz-relay --bin buzz-relay \
                                   -p buzz-admin --bin buzz-admin \
                                   -p buzz-pair-relay --bin buzz-pair-relay \
    && strip target/release/buzz-relay \
             target/release/buzz-admin \
             target/release/buzz-pair-relay

FROM node:${NODE_VERSION}-${DEBIAN_VERSION}-slim@sha256:b622a0bf896a85c5b13b7973eaf3f06e909cf539576551a67724323a21da2b17 AS web-builder
WORKDIR /build
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches/ patches/
COPY web/package.json web/
COPY admin-web/package.json admin-web/
RUN pnpm install --frozen-lockfile --filter buzz-web --filter buzz-admin-web
COPY web/ web/
COPY admin-web/ admin-web/
RUN pnpm -C web build && pnpm -C admin-web build

FROM debian:${DEBIAN_VERSION}-slim@sha256:3a39a0592364683e6bab97937b72cad5a8fa6dcbbee90edb3bb48c7f8e94f258 AS runtime
LABEL org.opencontainers.image.title="Buzz for StartOS" \
      org.opencontainers.image.description="Buzz relay runtime for the StartOS package" \
      org.opencontainers.image.source="https://github.com/mdubore/buzz-startos" \
      org.opencontainers.image.url="https://github.com/block/buzz" \
      org.opencontainers.image.revision="651f6372754e60e3f936b3397040eb0f1e44c9f3" \
      org.opencontainers.image.licenses="Apache-2.0" \
      io.start9.buzz.upstream.source="https://github.com/block/buzz"
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        openssl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1000 buzz \
    && useradd --system --uid 1000 --gid 1000 --home-dir /var/lib/buzz \
        --create-home --shell /usr/sbin/nologin buzz \
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
