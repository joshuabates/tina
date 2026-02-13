import { PRESETS } from "@convex/policyPresets"
import type { PolicySnapshot, ReviewPolicyConfig, ModelPolicyConfig } from "@convex/policyPresets"
import formStyles from "../FormDialog.module.scss"
import styles from "./PolicyEditor.module.scss"
import { MODEL_OPTIONS } from "@/lib/control-plane-styles"

const ENFORCEMENT_OPTIONS = ["task_and_phase", "task_only", "phase_only"] as const
const DETECTOR_SCOPE_OPTIONS = ["whole_repo_pattern_index", "touched_area_only", "architectural_allowlist_only"] as const
const ARCHITECT_MODE_OPTIONS = ["manual_only", "manual_plus_auto", "disabled"] as const
const TEST_INTEGRITY_OPTIONS = ["strict_baseline", "max_strict", "minimal"] as const
const ROLES = ["validator", "planner", "executor", "reviewer"] as const
const PRESET_NAMES = Object.keys(PRESETS) as Array<keyof typeof PRESETS>

function labelFor(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

interface PolicyEditorProps {
  value: PolicySnapshot
  onChange: (snapshot: PolicySnapshot) => void
}

export function PolicyEditor({ value, onChange }: PolicyEditorProps) {
  const updateReview = (field: keyof ReviewPolicyConfig, fieldValue: unknown) => {
    onChange({ ...value, review: { ...value.review, [field]: fieldValue } })
  }

  const updateModel = (role: keyof ModelPolicyConfig, model: string) => {
    onChange({ ...value, model: { ...value.model, [role]: model } })
  }

  const applyPreset = (presetName: string) => {
    const preset = PRESETS[presetName]
    if (preset) onChange(structuredClone(preset))
  }

  return (
    <div className={styles.policyEditor}>
      <div className={styles.presetRow}>
        <span className={formStyles.formLabel}>Presets</span>
        <div className={styles.presetButtons}>
          {PRESET_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              className={styles.presetButton}
              onClick={() => applyPreset(name)}
            >
              {labelFor(name)}
            </button>
          ))}
        </div>
      </div>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Model Policy</legend>
        <div className={styles.grid}>
          {ROLES.map((role) => (
            <div key={role} className={styles.fieldRow}>
              <label className={styles.fieldLabel}>{labelFor(role)}</label>
              <select
                className={formStyles.formInput}
                value={value.model[role]}
                onChange={(e) => updateModel(role, e.target.value)}
              >
                {MODEL_OPTIONS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Review Policy</legend>
        <div className={styles.grid}>
          <SelectField
            label="Enforcement"
            value={value.review.enforcement}
            options={ENFORCEMENT_OPTIONS}
            onChange={(v) => updateReview("enforcement", v)}
          />
          <SelectField
            label="Detector Scope"
            value={value.review.detector_scope}
            options={DETECTOR_SCOPE_OPTIONS}
            onChange={(v) => updateReview("detector_scope", v)}
          />
          <SelectField
            label="Architect Mode"
            value={value.review.architect_mode}
            options={ARCHITECT_MODE_OPTIONS}
            onChange={(v) => updateReview("architect_mode", v)}
          />
          <SelectField
            label="Test Integrity"
            value={value.review.test_integrity_profile}
            options={TEST_INTEGRITY_OPTIONS}
            onChange={(v) => updateReview("test_integrity_profile", v)}
          />
          <CheckboxField
            label="Hard Block Detectors"
            checked={value.review.hard_block_detectors}
            onChange={(v) => updateReview("hard_block_detectors", v)}
          />
          <CheckboxField
            label="Allow Rare Override"
            checked={value.review.allow_rare_override}
            onChange={(v) => updateReview("allow_rare_override", v)}
          />
          <CheckboxField
            label="Require Fix First"
            checked={value.review.require_fix_first}
            onChange={(v) => updateReview("require_fix_first", v)}
          />
        </div>
      </fieldset>
    </div>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: readonly string[]
  onChange: (value: string) => void
}) {
  return (
    <div className={styles.fieldRow}>
      <label className={styles.fieldLabel}>{label}</label>
      <select
        className={formStyles.formInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{labelFor(opt)}</option>
        ))}
      </select>
    </div>
  )
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className={styles.fieldRow}>
      <label className={styles.checkboxLabel}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{label}</span>
      </label>
    </div>
  )
}
