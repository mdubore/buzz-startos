#!/usr/bin/env bash
set -euo pipefail

EXPECTED_GRYPE_VERSION='0.116.0'

output_dir="${1:?usage: scan-runtime-images.sh OUTPUT_DIR [WAIVER_FILE]}"
waiver_file="${2:-security/vulnerability-waivers.json}"
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
trusted_config="$repo_root/security/grype-ci.yaml"

command -v grype >/dev/null
command -v node >/dev/null
test -f "$waiver_file"
test -f "$trusted_config"

if [[ -d "$output_dir" ]] &&
  [[ -n "$(find "$output_dir" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  printf 'refusing non-empty output directory: %s\n' "$output_dir" >&2
  exit 1
fi
mkdir -p "$output_dir"

while IFS= read -r variable; do
  case "$variable" in
    GRYPE_*|SYFT_*) unset "$variable" ;;
  esac
done < <(compgen -e)

grype_state="$(mktemp -d)"
trap 'rm -rf -- "$grype_state"' EXIT
mkdir -p "$grype_state/home" "$grype_state/xdg"
export HOME="$grype_state/home"
export XDG_CONFIG_HOME="$grype_state/xdg"

run_grype() {
  command grype --config "$trusted_config" "$@"
}

run_grype version -o json >"$output_dir/grype-version.json"
actual_grype_version="$(
  node -e '
    const { readFileSync } = require("node:fs")
    const version = JSON.parse(readFileSync(process.argv[1], "utf8")).version
    if (typeof version !== "string") process.exit(1)
    process.stdout.write(version)
  ' "$output_dir/grype-version.json"
)"
test "$actual_grype_version" = "$EXPECTED_GRYPE_VERSION"

run_grype config --load >"$output_dir/grype-effective-config.yaml"
npx --no-install tsx scripts/runtime-image-targets.ts --json \
  >"$output_dir/runtime-image-targets.json"
run_grype db update
run_grype db status -o json >"$output_dir/grype-db-status.json"

while IFS=$'\t' read -r id name architecture digest reference; do
  [[ "$id" =~ ^[A-Za-z0-9-]+$ ]]
  [[ "$name" =~ ^[A-Za-z0-9]+$ ]]
  [[ "$architecture" =~ ^(amd64|arm64)$ ]]
  [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]]
  [[ "$reference" =~ @sha256:[0-9a-f]{64}$ ]]

  run_grype "$reference" \
    --platform "linux/$architecture" \
    --output json \
    --file "$output_dir/$id.grype.json"
done < <(npx --no-install tsx scripts/runtime-image-targets.ts --tsv)

npx --no-install tsx scripts/check-vulnerability-waivers.ts grype \
  --waivers "$waiver_file" \
  --reports "$output_dir" \
  --targets "$output_dir/runtime-image-targets.json"
