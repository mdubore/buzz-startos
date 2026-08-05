#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: $0 <buzz|minio|mc> <destination>" >&2
  exit 2
}

[[ $# -eq 2 ]] || usage

service="$1"
destination="$2"
repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

case "$service" in
  buzz)
    repository="https://github.com/block/buzz.git"
    release=""
    revision="651f6372754e60e3f936b3397040eb0f1e44c9f3"
    patch_directory=""
    ;;
  minio)
    repository="https://github.com/minio/minio.git"
    release="RELEASE.2025-10-15T17-29-55Z"
    revision="9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a"
    patch_directory="$repository_root/images/minio"
    ;;
  mc)
    repository="https://github.com/minio/mc.git"
    release="RELEASE.2025-08-13T08-35-41Z"
    revision="7394ce0dd2a80935aded936b09fa12cbb3cb8096"
    patch_directory="$repository_root/images/mc"
    ;;
  *) usage ;;
esac

if [[ -e "$destination" ]]; then
  echo "refusing to replace existing source destination: $destination" >&2
  exit 1
fi

destination_parent="$(dirname "$destination")"
mkdir -p "$destination_parent"
staging="$(mktemp -d "$destination_parent/.buzz-image-source.XXXXXX")"
cleanup() {
  if [[ -n "${staging:-}" && -d "$staging" ]]; then
    rm -rf "$staging"
  fi
}
trap cleanup EXIT

git -C "$staging" init --quiet
git -C "$staging" remote add origin "$repository"
git -C "$staging" fetch --quiet --depth=1 origin "$revision"
git -C "$staging" checkout --quiet --detach FETCH_HEAD

actual_revision="$(git -C "$staging" rev-parse HEAD)"
if [[ "$actual_revision" != "$revision" ]]; then
  echo "source revision mismatch: expected $revision, got $actual_revision" >&2
  exit 1
fi

if [[ -n "$release" ]]; then
  git -C "$staging" fetch --quiet --depth=1 origin \
    "refs/tags/$release:refs/tags/$release"
  release_revision="$(git -C "$staging" rev-list -n 1 "$release")"
  if [[ "$release_revision" != "$revision" ]]; then
    echo "release $release resolves to $release_revision, expected $revision" >&2
    exit 1
  fi
fi

initial_status="$(git -C "$staging" status --porcelain --untracked-files=all)"
if [[ -n "$initial_status" ]]; then
  echo "refusing dirty prepared source tree" >&2
  exit 1
fi

if [[ -n "$patch_directory" ]]; then
  install -m 0644 "$patch_directory/go.mod" "$staging/go.mod"
  install -m 0644 "$patch_directory/go.sum" "$staging/go.sum"
  changed_files="$(git -C "$staging" diff --name-only)"
  if [[ "$changed_files" != $'go.mod\ngo.sum' ]]; then
    echo "reviewed module patch changed unexpected files: $changed_files" >&2
    exit 1
  fi
  git -C "$staging" diff --check -- go.mod go.sum
fi

mv "$staging" "$destination"
staging=""
printf '%s\t%s\t%s\n' "$service" "$release" "$revision"
