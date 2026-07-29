#!/usr/bin/env bash
set -euo pipefail

if (($# != 7)); then
  printf 'Usage: %s PACKAGES SCANS SBOMS OUTPUT TAG VERSION COMMIT\n' "$0" >&2
  exit 64
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repository_root="$(cd -- "$script_dir/.." && pwd -P)"
packages_dir="$1"
scans_dir="$2"
sboms_dir="$3"
output_dir="$4"
tag="$5"
package_version="$6"
package_commit="$7"

[[ "$tag" == "v${package_version/:/_}" ]]
[[ "$package_version" =~ ^[^[:space:]]+:[0-9]+$ ]]
[[ "$package_commit" =~ ^[0-9a-f]{40}$ ]]

assert_exact_directory() {
  local directory="$1"
  shift
  [[ -d "$directory" ]]
  local actual expected
  actual="$(
    find "$directory" -mindepth 1 -maxdepth 1 -printf '%f\n' | sort
  )"
  expected="$(printf '%s\n' "$@" | sort)"
  [[ "$actual" == "$expected" ]]
  [[ -z "$(find "$directory" -mindepth 1 -maxdepth 1 -type l -print -quit)" ]]
  local name
  for name in "$@"; do
    [[ -f "$directory/$name" ]]
    [[ ! -L "$directory/$name" ]]
    [[ -s "$directory/$name" ]]
  done
}

mapfile -t target_ids < <(
  cd -- "$repository_root"
  npx --no-install tsx scripts/runtime-image-targets.ts --tsv | cut -f1
)
[[ "${#target_ids[@]}" -eq 10 ]]

scan_names=(
  grype-db-status.json
  grype-effective-config.yaml
  grype-version.json
  runtime-image-targets.json
)
sbom_names=(
  buzz-node.cdx.json
  cyclonedx-cli-version.txt
  syft-version.json
)
for id in "${target_ids[@]}"; do
  [[ "$id" =~ ^[A-Za-z0-9-]+$ ]]
  scan_names+=("$id.grype.json")
  sbom_names+=("$id.cdx.json")
done

assert_exact_directory \
  "$packages_dir" \
  buzz_aarch64.s9pk \
  buzz_x86_64.s9pk
assert_exact_directory "$scans_dir" "${scan_names[@]}"
assert_exact_directory "$sboms_dir" "${sbom_names[@]}"

if [[ -e "$output_dir" ]]; then
  [[ -d "$output_dir" ]]
  [[ -z "$(find "$output_dir" -mindepth 1 -maxdepth 1 -print -quit)" ]]
else
  mkdir -p -- "$output_dir"
fi
output_dir="$(cd -- "$output_dir" && pwd -P)"

"$script_dir/verify-s9pk-signer.sh" \
  "$packages_dir/buzz_x86_64.s9pk" \
  "$packages_dir/buzz_aarch64.s9pk"
(
  cd -- "$repository_root"
  npx --no-install tsx scripts/check-vulnerability-waivers.ts grype \
    --waivers security/vulnerability-waivers.json \
    --reports "$scans_dir" \
    --targets "$scans_dir/runtime-image-targets.json"
)

cp --update=none --preserve=mode \
  "$packages_dir/buzz_x86_64.s9pk" \
  "$packages_dir/buzz_aarch64.s9pk" \
  "$output_dir/"
(
  cd -- "$repository_root"
  npx --no-install tsx scripts/release-assets.ts create-verification \
    "$output_dir" \
    "$output_dir/release-verification.json" \
    "$tag" \
    "$package_version" \
    "$package_commit"
)
cp --update=none --preserve=mode \
  "$repository_root/assets/signing-pubkey.pem" \
  "$output_dir/SIGNING-PUBKEY.pem"
cp --update=none --preserve=mode \
  "$repository_root/assets/signing-pubkey.sha256" \
  "$output_dir/SIGNING-PUBKEY.sha256"
for name in "${scan_names[@]}"; do
  cp --update=none --preserve=mode "$scans_dir/$name" "$output_dir/$name"
done
for name in "${sbom_names[@]}"; do
  cp --update=none --preserve=mode "$sboms_dir/$name" "$output_dir/$name"
done

(
  cd -- "$repository_root"
  npx --no-install tsx scripts/release-assets.ts write-indexes "$output_dir"
)

"$script_dir/verify-release-assets.sh" \
  "$output_dir" \
  "$tag" \
  "$package_version" \
  "$package_commit"
