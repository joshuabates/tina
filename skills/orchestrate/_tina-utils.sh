#!/bin/bash
# TINA state management utilities for orchestrate skill
# Source this file: source "$(dirname "$0")/_tina-utils.sh"

set -e

# Initialize .tina directory structure for orchestration
# Usage: tina_init_supervisor <design_doc_path> <total_phases>
tina_init_supervisor() {
  local design_doc="$1"
  local total_phases="$2"
  local tina_dir="${PWD}/.tina"

  mkdir -p "$tina_dir"

  # Create supervisor state
  cat > "$tina_dir/supervisor-state.json" << EOF
{
  "design_doc_path": "$design_doc",
  "total_phases": $total_phases,
  "current_phase": 0,
  "active_tmux_session": null,
  "plan_paths": {}
}
EOF

  echo "$tina_dir/supervisor-state.json"
}

# Read supervisor state field
# Usage: tina_get_supervisor_field <field>
tina_get_supervisor_field() {
  local field="$1"
  local tina_dir="${PWD}/.tina"

  jq -r ".$field // empty" "$tina_dir/supervisor-state.json"
}

# Update supervisor state field
# Usage: tina_set_supervisor_field <field> <value>
tina_set_supervisor_field() {
  local field="$1"
  local value="$2"
  local tina_dir="${PWD}/.tina"
  local state_file="$tina_dir/supervisor-state.json"

  local tmp_file=$(mktemp)
  jq --arg f "$field" --argjson v "$value" \
     '.[$f] = $v' "$state_file" > "$tmp_file"
  mv "$tmp_file" "$state_file"
}

# Add plan path to supervisor state
# Usage: tina_add_plan_path <phase_num> <plan_path>
tina_add_plan_path() {
  local phase_num="$1"
  local plan_path="$2"
  local tina_dir="${PWD}/.tina"
  local state_file="$tina_dir/supervisor-state.json"

  local tmp_file=$(mktemp)
  jq --arg pn "$phase_num" --arg pp "$plan_path" \
     '.plan_paths[$pn] = $pp' "$state_file" > "$tmp_file"
  mv "$tmp_file" "$state_file"
}

# Initialize phase directory
# Usage: tina_init_phase <phase_num>
tina_init_phase() {
  local phase_num="$1"
  local phase_dir="${PWD}/.tina/phase-$phase_num"

  mkdir -p "$phase_dir"

  cat > "$phase_dir/status.json" << EOF
{
  "status": "pending",
  "started_at": null
}
EOF

  echo "$phase_dir"
}

# Update phase status
# Usage: tina_set_phase_status <phase_num> <status> [reason]
tina_set_phase_status() {
  local phase_num="$1"
  local new_status="$2"
  local reason="${3:-}"
  local phase_dir="${PWD}/.tina/phase-$phase_num"
  local status_file="$phase_dir/status.json"

  local tmp_file=$(mktemp)
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  if [ -n "$reason" ]; then
    jq --arg s "$new_status" --arg r "$reason" --arg ts "$timestamp" \
       '.status = $s | .updated_at = $ts | .reason = $r' "$status_file" > "$tmp_file"
  else
    jq --arg s "$new_status" --arg ts "$timestamp" \
       '.status = $s | .updated_at = $ts' "$status_file" > "$tmp_file"
  fi
  mv "$tmp_file" "$status_file"
}

# Get phase status
# Usage: tina_get_phase_status <phase_num>
tina_get_phase_status() {
  local phase_num="$1"
  local phase_dir="${PWD}/.tina/phase-$phase_num"

  jq -r '.status // "unknown"' "$phase_dir/status.json"
}

# Check if phase is complete
# Usage: tina_is_phase_complete <phase_num>
tina_is_phase_complete() {
  local phase_num="$1"
  local status=$(tina_get_phase_status "$phase_num")

  [ "$status" = "complete" ]
}

# Check if supervisor state exists (for resumption)
# Usage: tina_supervisor_exists
tina_supervisor_exists() {
  [ -f "${PWD}/.tina/supervisor-state.json" ]
}

# Count phases in design doc by parsing ## Phase N sections
# Usage: tina_count_phases <design_doc_path>
tina_count_phases() {
  local design_doc="$1"
  grep -c "^## Phase [0-9]" "$design_doc" 2>/dev/null || echo "0"
}
