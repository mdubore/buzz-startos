#!/usr/bin/env bash
set -euo pipefail

EXPECTED_GRYPE_VERSION='0.116.0'

output_dir="${1:?usage: scan-runtime-images.sh OUTPUT_DIR [WAIVER_FILE]}"
waiver_file="${2:-security/vulnerability-waivers.json}"

command -v grype >/dev/null
command -v node >/dev/null
test -f "$waiver_file"

actual_grype_version="$(
  grype version -o json |
    node -e '
      let input = ""
      process.stdin.setEncoding("utf8")
      process.stdin.on("data", (chunk) => { input += chunk })
      process.stdin.on("end", () => {
        const version = JSON.parse(input).version
        if (typeof version !== "string") process.exit(1)
        process.stdout.write(version)
      })
    '
)"
test "$actual_grype_version" = "$EXPECTED_GRYPE_VERSION"

if [[ -d "$output_dir" ]] &&
  [[ -n "$(find "$output_dir" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  printf 'refusing non-empty output directory: %s\n' "$output_dir" >&2
  exit 1
fi
mkdir -p "$output_dir"

grype version -o json >"$output_dir/grype-version.json"
npx --no-install tsx scripts/runtime-image-targets.ts --json \
  >"$output_dir/runtime-image-targets.json"
grype db update
grype db status -o json >"$output_dir/grype-db-status.json"

while IFS=$'\t' read -r id name architecture digest reference; do
  [[ "$id" =~ ^[A-Za-z0-9-]+$ ]]
  [[ "$name" =~ ^[A-Za-z0-9]+$ ]]
  [[ "$architecture" =~ ^(amd64|arm64)$ ]]
  [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]]
  [[ "$reference" =~ @sha256:[0-9a-f]{64}$ ]]

  grype "$reference" \
    --output json \
    --file "$output_dir/$id.grype.json"
done < <(npx --no-install tsx scripts/runtime-image-targets.ts --tsv)

npx --no-install tsx scripts/check-vulnerability-waivers.ts grype \
  --waivers "$waiver_file" \
  --reports "$output_dir" \
  --targets "$output_dir/runtime-image-targets.json"
