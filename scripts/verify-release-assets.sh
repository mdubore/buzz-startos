#!/usr/bin/env bash
set -euo pipefail

if (($# != 4)); then
  printf 'Usage: %s ASSET_DIRECTORY TAG VERSION COMMIT\n' "$0" >&2
  exit 64
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repository_root="$(cd -- "$script_dir/.." && pwd -P)"
asset_dir="$(cd -- "$1" && pwd -P)"
tag="$2"
package_version="$3"
package_commit="$4"

[[ "$tag" == "v${package_version/:/_}" ]]
[[ "$package_version" =~ ^[^[:space:]]+:[0-9]+$ ]]
[[ "$package_commit" =~ ^[0-9a-f]{40}$ ]]

cmp -s \
  "$repository_root/assets/signing-pubkey.pem" \
  "$asset_dir/SIGNING-PUBKEY.pem"
cmp -s \
  "$repository_root/assets/signing-pubkey.sha256" \
  "$asset_dir/SIGNING-PUBKEY.sha256"
"$script_dir/verify-s9pk-signer.sh" \
  "$asset_dir/buzz_x86_64.s9pk" \
  "$asset_dir/buzz_aarch64.s9pk"

mapfile -t target_ids < <(
  cd -- "$repository_root"
  npx --no-install tsx scripts/runtime-image-targets.ts --tsv | cut -f1
)
[[ "${#target_ids[@]}" -eq 10 ]]

cyclonedx validate \
  --input-file "$asset_dir/buzz-node.cdx.json" \
  --input-format json \
  --input-version v1_6 \
  --fail-on-errors
for id in "${target_ids[@]}"; do
  [[ "$id" =~ ^[A-Za-z0-9-]+$ ]]
  cyclonedx validate \
    --input-file "$asset_dir/$id.cdx.json" \
    --input-format json \
    --input-version v1_6 \
    --fail-on-errors
done

(
  cd -- "$repository_root"
  npx --no-install tsx scripts/release-assets.ts verify-sbom-subjects \
    "$asset_dir" \
    "$package_version"
  npx --no-install tsx scripts/check-vulnerability-waivers.ts grype \
    --waivers security/vulnerability-waivers.json \
    --reports "$asset_dir" \
    --targets "$asset_dir/runtime-image-targets.json"
  npx --no-install tsx scripts/release-assets.ts verify-record \
    "$asset_dir/release-verification.json" \
    "$tag" \
    "$package_version" \
    "$package_commit"
  npx --no-install tsx scripts/release-assets.ts verify-indexes "$asset_dir"
)
