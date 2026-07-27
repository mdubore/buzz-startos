#!/usr/bin/env bash
set -euo pipefail

if (($# == 0)); then
  printf 'Usage: %s <archive.s9pk> [archive.s9pk ...]\n' "$0" >&2
  exit 64
fi

for command in openssl dd xxd cmp sha256sum start-cli; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'ERROR: required command not found: %s\n' "$command" >&2
    exit 69
  fi
done

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
PUBLIC_KEY_FILE="$ROOT_DIR/assets/signing-pubkey.pem"
FINGERPRINT_FILE="$ROOT_DIR/assets/signing-pubkey.sha256"

KEY_DER="$(mktemp)"
KEY_RAW="$(mktemp)"
ACTUAL_FINGERPRINT="$(mktemp)"
ARCHIVE_MAGIC="$(mktemp)"
ARCHIVE_SIGNER="$(mktemp)"

cleanup() {
  rm -- \
    "$KEY_DER" \
    "$KEY_RAW" \
    "$ACTUAL_FINGERPRINT" \
    "$ARCHIVE_MAGIC" \
    "$ARCHIVE_SIGNER"
}
trap cleanup EXIT

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

if ! openssl pkey \
  -pubin \
  -in "$PUBLIC_KEY_FILE" \
  -outform DER \
  -out "$KEY_DER" \
  >/dev/null 2>&1; then
  fail 'committed signing public key is not valid PEM'
fi

if [[ "$(wc -c < "$KEY_DER")" -ne 44 ]]; then
  fail 'committed signing public key has an invalid DER length'
fi

if [[ "$(xxd -p -l 12 "$KEY_DER")" != '302a300506032b6570032100' ]]; then
  fail 'committed signing public key is not Ed25519'
fi

dd if="$KEY_DER" of="$KEY_RAW" bs=1 skip=12 count=32 status=none
if [[ "$(wc -c < "$KEY_RAW")" -ne 32 ]]; then
  fail 'committed signing public key has an invalid raw-key length'
fi

if [[ ! -f "$FINGERPRINT_FILE" ]]; then
  fail 'committed signing fingerprint is missing'
fi

read -r fingerprint_hash _ < <(sha256sum "$KEY_RAW")
printf 'sha256:%s\n' "$fingerprint_hash" > "$ACTUAL_FINGERPRINT"

if ! cmp -s "$FINGERPRINT_FILE" "$ACTUAL_FINGERPRINT"; then
  fail 'committed signing fingerprint does not match the public key'
fi

for archive_arg in "$@"; do
  if [[ ! -f "$archive_arg" ]]; then
    fail "archive is not a regular file: $archive_arg"
  fi

  archive_path="$archive_arg"
  if [[ "$archive_path" != /* ]]; then
    archive_path="$PWD/$archive_path"
  fi

  if [[ "$(wc -c < "$archive_path")" -lt 35 ]]; then
    fail "archive is too short for an S9PK v2 header: $archive_arg"
  fi

  dd if="$archive_path" of="$ARCHIVE_MAGIC" bs=1 count=3 status=none
  if [[ "$(xxd -p -c 3 "$ARCHIVE_MAGIC")" != '3b3b02' ]]; then
    fail "archive does not have S9PK v2 magic: $archive_arg"
  fi

  dd \
    if="$archive_path" \
    of="$ARCHIVE_SIGNER" \
    bs=1 \
    skip=3 \
    count=32 \
    status=none
  if ! cmp -s "$KEY_RAW" "$ARCHIVE_SIGNER"; then
    fail "archive signer does not match the committed public key: $archive_arg"
  fi

  if ! start-cli s9pk inspect "$archive_path" commitment >/dev/null 2>&1; then
    fail "archive signature verification failed: $archive_arg"
  fi

  printf 'OK %s signer sha256:%s\n' "$archive_arg" "$fingerprint_hash"
done
