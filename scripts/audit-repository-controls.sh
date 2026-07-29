#!/usr/bin/env bash
set -euo pipefail

repository="${1:-${GITHUB_REPOSITORY:-mdubore/buzz-startos}}"
api_version="${GITHUB_API_VERSION:-2026-03-10}"
failures=0
checks=0
response=''

if [[ ! "$repository" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  printf 'invalid GitHub repository: %s\n' "$repository" >&2
  exit 64
fi

request() {
  local endpoint="$1"
  if response="$(
    gh api -H "X-GitHub-Api-Version: $api_version" "$endpoint" 2>&1
  )"; then
    return 0
  fi
  return 1
}

pass() {
  checks=$((checks + 1))
  printf '%s: PASS\n' "$1"
}

fail() {
  checks=$((checks + 1))
  failures=$((failures + 1))
  printf '%s: FAIL\n' "$1"
}

info_absent() {
  checks=$((checks + 1))
  printf '%s: INFO (absent)\n' "$1"
}

check_endpoint() {
  local label="$1"
  local endpoint="$2"
  if request "$endpoint"; then
    pass "$label"
  else
    fail "$label"
  fi
}

check_json() {
  local label="$1"
  local endpoint="$2"
  local filter="$3"
  if ! request "$endpoint"; then
    fail "$label"
    return
  fi
  if jq -e "$filter" >/dev/null 2>&1 <<<"$response"; then
    pass "$label"
  else
    fail "$label"
  fi
}

collect_optional_endpoint() {
  local label="$1"
  local endpoint="$2"
  if request "$endpoint"; then
    pass "$label"
  elif [[ "$response" == *'HTTP 404'* ]]; then
    info_absent "$label"
  else
    fail "$label"
  fi
}

check_rulesets() {
  local endpoint="repos/$repository/rulesets"
  local tag_ruleset_id
  if ! request "$endpoint"; then
    fail 'Active main ruleset'
    fail 'Active release tag ruleset'
    return
  fi

  if jq -e \
    '[.[] | select(.target == "branch" and .enforcement == "active")] | length > 0' \
    >/dev/null 2>&1 <<<"$response"; then
    pass 'Active main ruleset'
  else
    fail 'Active main ruleset'
  fi

  tag_ruleset_id="$(
    jq -r \
      '[.[] | select(.target == "tag" and .enforcement == "active")][0].id // empty' \
      <<<"$response" 2>/dev/null || true
  )"
  if [[ ! "$tag_ruleset_id" =~ ^[0-9]+$ ]]; then
    fail 'Active release tag ruleset'
    return
  fi
  if ! request "repos/$repository/rulesets/$tag_ruleset_id"; then
    fail 'Active release tag ruleset'
    return
  fi
  if jq -e '
    .target == "tag" and
    .enforcement == "active" and
    (.conditions.ref_name.include | index("refs/tags/v*.*") != null) and
    ([.rules[].type] as $types |
      ($types | index("creation") != null) and
      ($types | index("update") != null) and
      ($types | index("deletion") != null))
  ' >/dev/null 2>&1 <<<"$response"; then
    pass 'Active release tag ruleset'
  else
    fail 'Active release tag ruleset'
  fi
}

check_endpoint \
  'Vulnerability alerts' \
  "repos/$repository/vulnerability-alerts"
check_endpoint \
  'Automated security fixes' \
  "repos/$repository/automated-security-fixes"
check_json \
  'Private vulnerability reporting' \
  "repos/$repository/private-vulnerability-reporting" \
  '.enabled == true'
check_json \
  'Selected Actions and full SHA policy' \
  "repos/$repository/actions/permissions" \
  '.allowed_actions == "selected" and .sha_pinning_required == true'
check_json \
  'GitHub-owned Actions allowlist' \
  "repos/$repository/actions/permissions/selected-actions" \
  '.github_owned_allowed == true and .verified_allowed == false and ((.patterns_allowed // []) | length == 0)'
check_json \
  'Immutable releases' \
  "repos/$repository/immutable-releases" \
  '.enabled == true'
check_rulesets
check_json \
  'Independent release approval' \
  "repos/$repository/environments/release" \
  '[.protection_rules[]? | select(.type == "required_reviewers" and .prevent_self_review == true and (.reviewers | length >= 2))] | length > 0'
check_json \
  'Release tag deployment policy' \
  "repos/$repository/environments/release/deployment-branch-policies" \
  '[.branch_policies[]? | select(.type == "tag" and .name == "v*.*")] | length == 1'
collect_optional_endpoint \
  'Legacy main branch protection readback' \
  "repos/$repository/branches/main/protection"
collect_optional_endpoint \
  'Legacy commit-signature readback' \
  "repos/$repository/branches/main/protection/required_signatures"
check_json \
  'Repository merge and security settings' \
  "repos/$repository" \
  '.delete_branch_on_merge == true and .security_and_analysis.dependabot_security_updates.status == "enabled" and .security_and_analysis.secret_scanning.status == "enabled" and .security_and_analysis.secret_scanning_push_protection.status == "enabled"'

if ((failures > 0)); then
  printf 'Repository control audit failed: %d of %d checks\n' \
    "$failures" "$checks"
  exit 1
fi
printf 'Repository control audit passed: %d checks\n' "$checks"
