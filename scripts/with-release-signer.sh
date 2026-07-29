#!/usr/bin/env bash
set -euo pipefail
set +x

if (($# < 3)); then
  printf 'Usage: %s HOME_KEY WORKSPACE_KEY COMMAND [ARG ...]\n' "$0" >&2
  exit 64
fi

SIGNER_HOME_FILE="$1"
SIGNER_WORKSPACE_FILE="$2"
shift 2

cleanup_signer() {
  set +x
  unset DEV_KEY
  rm -f -- "$SIGNER_HOME_FILE" "$SIGNER_WORKSPACE_FILE"
}
trap cleanup_signer EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

[[ -n "${DEV_KEY:-}" ]]
[[ -d "${SIGNER_HOME_FILE%/*}" ]]
[[ -d "${SIGNER_WORKSPACE_FILE%/*}" ]]
[[ ! -e "$SIGNER_HOME_FILE" ]]
[[ ! -e "$SIGNER_WORKSPACE_FILE" ]]
umask 077
printf '%s' "$DEV_KEY" > "$SIGNER_HOME_FILE"
unset DEV_KEY

[[ -z "${DEV_KEY+x}" ]]
if printenv DEV_KEY >/dev/null 2>&1; then
  printf 'DEV_KEY remained in the child-process environment\n' >&2
  exit 1
fi
cp -- "$SIGNER_HOME_FILE" "$SIGNER_WORKSPACE_FILE"
chmod 0600 "$SIGNER_HOME_FILE" "$SIGNER_WORKSPACE_FILE"
env -u DEV_KEY "$@"

cleanup_signer
trap - EXIT HUP INT TERM
