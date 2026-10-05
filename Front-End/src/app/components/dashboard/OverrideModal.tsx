import { useState, type FormEvent } from "react";
import { Button, Field, Modal, Select } from "../../ui";
import { overrideRiskAssessment } from "../../api/client";
import type { OverrideInput, OverrideResult, RiskAssessment, RiskLevel } from "../../api/types";

interface Props {
  assessment: RiskAssessment;
  onClose: () => void;
  onSaved: (result: OverrideResult, wasReviewed: boolean) => void;
}

const textarea =
  "w-full rounded-[12px] border border-[#d6deec] bg-white px-3.5 py-3 text-[15px] leading-relaxed text-[#0b1530] placeholder:text-[#8fa1c4] focus:border-[#1f5eff]";

/** Clinician override. Sends only the fields the user changed (server merges: omitted keeps). */
export function OverrideModal({ assessment, onClose, onSaved }: Props) {
  const [level, setLevel] = useState<"" | RiskLevel>("");
  const [recommendation, setRecommendation] = useState(assessment.effectiveRecommendation);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [keepText, setKeepText] = useState(false);

  const levelChanged = level !== "" && level !== assessment.effectiveRiskLevel;
  const recChanged = recommendation.trim() !== assessment.effectiveRecommendation.trim();
  // A level change with the old text would pair e.g. a High badge with "Low risk: ..." wording.
  const needsTextDecision = levelChanged && !recChanged;
  const blocked = needsTextDecision && !keepText;
  const hasOverrideText = Boolean(assessment.overrideRecommendation);
  const keepLabel = hasOverrideText
    ? `Keep the current override recommendation (written for ${assessment.effectiveRiskLevel} risk)`
    : `Keep the model's recommendation text (written for ${assessment.riskLevel} risk)`;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (blocked) return;
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 5 || trimmedReason.length > 2000) {
      setReasonError("Enter a reason of 5 to 2000 characters.");
      return;
    }
    setReasonError(undefined);

    const input: OverrideInput = { reason: trimmedReason };
    // Picking the level already in effect is not a change.
    if (level && level !== assessment.effectiveRiskLevel) input.riskLevel = level;
    const recText = recommendation.trim();
    if (recText !== assessment.effectiveRecommendation.trim()) {
      if (!recText) {
        setError("The recommendation cannot be empty.");
        return;
      }
      input.recommendation = recText;
    }
    if (!("riskLevel" in input) && !("recommendation" in input)) {
      setError("Change the risk level or the recommendation before saving.");
      return;
    }

    setSaving(true);
    try {
      const result = await overrideRiskAssessment(assessment.assessmentId, input);
      onSaved(result, assessment.reviewStatus === "reviewed");
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Could not save the override. Try again.");
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Override assessment" className="max-w-[520px]">
      <form onSubmit={submit} className="mt-5 flex flex-col gap-4" noValidate>
        <p className="text-[14px] font-semibold text-[#0b1530]">
          {`${assessment.patientName}${assessment.externalPatientCode ? ` · ${assessment.externalPatientCode}` : ""}`}
        </p>
        <p className="text-[13px] text-[#5b6b85]">
          The model score stays on record. Your override replaces the displayed risk level and recommendation and
          needs a reason. Saving returns the assessment to “Pending review”.
        </p>
        <Field label="Risk level">
          {(c) => (
            <Select {...c} value={level} onChange={(e) => {
                setLevel(e.target.value as "" | RiskLevel);
                setKeepText(false);
              }}>
              <option value="">Keep current ({assessment.effectiveRiskLevel.charAt(0).toUpperCase() + assessment.effectiveRiskLevel.slice(1)})</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
          )}
        </Field>
        <Field
          label="Recommendation"
          hint={needsTextDecision ? "Edit the recommendation for the new level, or tick the box below to keep the model text." : undefined}
        >
          {(c) => (
            <textarea
              {...c}
              rows={4}
              className={textarea}
              value={recommendation}
              onChange={(e) => setRecommendation(e.target.value)}
            />
          )}
        </Field>
        {needsTextDecision && (
          <label className="flex items-start gap-2 rounded-[12px] bg-[#fef3c7] px-3.5 py-2.5 text-[13px] text-[#b45309]">
            <input type="checkbox" checked={keepText} onChange={(e) => setKeepText(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{keepLabel}</span>
          </label>
        )}
        <Field label="Reason (required)" error={reasonError} hint="Recorded in the audit trail. 5 to 2000 characters.">
          {(c) => (
            <textarea
              {...c}
              rows={3}
              maxLength={2000}
              className={textarea}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>
        {error && (
          <p role="alert" className="text-[13px] font-semibold text-[#b91c1c]">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || blocked}>
            {saving ? "Saving…" : "Save override"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
