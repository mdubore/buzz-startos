#!/usr/bin/env bash
set -euo pipefail

EXPECTED_SYFT_VERSION='1.49.0'
EXPECTED_CYCLONEDX_VERSION='0.32.0+0ed788d25c13cef9e9a3029603f6b708e3279390'

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repository_root="$(cd -- "$script_dir/.." && pwd -P)"
output_dir="${1:?usage: generate-sboms.sh OUTPUT_DIRECTORY}"

command -v syft >/dev/null
command -v cyclonedx >/dev/null
command -v node >/dev/null

if [[ -e "$output_dir" ]]; then
  [[ -d "$output_dir" ]]
  [[ -z "$(find "$output_dir" -mindepth 1 -maxdepth 1 -print -quit)" ]]
else
  mkdir -p -- "$output_dir"
fi
output_dir="$(cd -- "$output_dir" && pwd -P)"

temporary_dir="$(mktemp -d)"
trap 'rm -rf -- "$temporary_dir"' EXIT
mkdir -p -- "$temporary_dir/config" "$temporary_dir/home"
syft_config="$temporary_dir/config/syft.yaml"
printf '{}\n' >"$syft_config"
clean_syft=(
  env -i
  "HOME=$temporary_dir/home"
  "PATH=$PATH"
  "XDG_CONFIG_HOME=$temporary_dir/config"
  SYFT_CHECK_FOR_APP_UPDATE=false
)

"${clean_syft[@]}" syft version -o json >"$temporary_dir/syft-version.json"
actual_syft_version="$(
  node -e '
    let input = ""
    process.stdin.setEncoding("utf8")
    process.stdin.on("data", (chunk) => { input += chunk })
    process.stdin.on("end", () => {
      const parsed = JSON.parse(input)
      if (typeof parsed.version !== "string") process.exit(1)
      process.stdout.write(parsed.version)
    })
  ' <"$temporary_dir/syft-version.json"
)"
[[ "$actual_syft_version" == "$EXPECTED_SYFT_VERSION" ]]

actual_cyclonedx_version="$(cyclonedx --version)"
[[ "$actual_cyclonedx_version" == "$EXPECTED_CYCLONEDX_VERSION" ]]
printf '%s\n' "$actual_cyclonedx_version" \
  >"$temporary_dir/cyclonedx-cli-version.txt"

package_version="$(
  sed -nE "s/^[[:space:]]*version:[[:space:]]*['\"]([^'\"]+)['\"],?$/\1/p" \
    "$repository_root/startos/versions/current.ts"
)"
[[ "$package_version" =~ ^[^[:space:]]+:[0-9]+$ ]]

generate_sbom() {
  local output_name="$1"
  shift
  local raw_path="$temporary_dir/$output_name.raw"
  local canonical_path="$temporary_dir/$output_name"

  "${clean_syft[@]}" syft "$@" \
    --config "$syft_config" \
    --quiet \
    --output cyclonedx-json@1.6 \
    >"$raw_path"
  (
    cd -- "$repository_root"
    npx --no-install tsx scripts/release-assets.ts \
      canonicalize-sbom "$raw_path" "$canonical_path"
  )
  cyclonedx validate \
    --input-file "$canonical_path" \
    --input-format json \
    --input-version v1_6 \
    --fail-on-errors
}

generate_sbom \
  buzz-node.cdx.json \
  "file:$repository_root/package-lock.json" \
  --override-default-catalogers javascript-lock-cataloger \
  --source-name buzz-startos \
  --source-version "$package_version"

while IFS=$'\t' read -r id _name architecture digest reference; do
  [[ "$id" =~ ^[A-Za-z0-9-]+$ ]]
  [[ "$architecture" =~ ^(amd64|arm64)$ ]]
  [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]]
  [[ "$reference" =~ @sha256:[0-9a-f]{64}$ ]]
  [[ "${reference##*@}" == "$digest" ]]
  generate_sbom \
    "$id.cdx.json" \
    "$reference" \
    --platform "linux/$architecture" \
    --scope squashed \
    --source-name "$id" \
    --source-version "$digest"
done < <(
  cd -- "$repository_root"
  npx --no-install tsx scripts/runtime-image-targets.ts --tsv
)

(
  cd -- "$repository_root"
  npx --no-install tsx scripts/release-assets.ts \
    verify-sbom-subjects "$temporary_dir" "$package_version"
)

find "$temporary_dir" -maxdepth 1 -type f -name '*.raw' -delete
test "$(find "$temporary_dir" -maxdepth 1 -type f -name '*.cdx.json' | wc -l)" \
  -eq 11
test "$(find "$temporary_dir" -mindepth 1 -maxdepth 1 -type f | wc -l)" -eq 13
test -z "$(
  find "$temporary_dir" -mindepth 1 -maxdepth 1 -type f -size 0 -print -quit
)"

find "$temporary_dir" -mindepth 1 -maxdepth 1 -type f \
  -exec cp --update=none --preserve=mode '{}' "$output_dir/" \;
test "$(find "$output_dir" -mindepth 1 -maxdepth 1 -type f | wc -l)" -eq 13
