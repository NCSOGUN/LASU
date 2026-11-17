"use client";

import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { TimePicker } from "@/components/arc/time-picker/time-picker";
import type { MedicationEntry } from "@/api/schemas";
import styles from "./medications.module.css";

export interface DrugDraft {
  drug: string;
  dose: string;
  frequency: string;
  times: string[];
}

export function emptyDrug(): DrugDraft {
  return { drug: "", dose: "", frequency: "", times: ["08:00"] };
}

function parseTime(value: string) {
  const [hour = Number.NaN, minute = Number.NaN] = value.split(":").map(Number);
  return Number.isFinite(hour) && Number.isFinite(minute) ? { hour, minute } : null;
}

export function toMedicationEntry(draft: DrugDraft): MedicationEntry | null {
  const drug = draft.drug.trim();
  const times = draft.times.map(parseTime).filter((time): time is { hour: number; minute: number } => Boolean(time));
  if (!drug || !times.length) return null;
  const entry: MedicationEntry = { drug, times };
  if (draft.dose.trim()) entry.dose = draft.dose.trim();
  if (draft.frequency.trim()) entry.frequency = draft.frequency.trim();
  return entry;
}

export function DrugFields({
  index,
  value,
  onChange,
  onRemove,
  removable = true,
  disabled = false,
}: {
  index: number;
  value: DrugDraft;
  onChange: (next: DrugDraft) => void;
  onRemove?: () => void;
  removable?: boolean;
  disabled?: boolean;
}) {
  const number = index + 1;
  return (
    <fieldset className={styles.drugCard}>
      <legend className={styles.drugTitle}>Drug {number}</legend>
      {removable ? (
        <div className={styles.drugHeader}>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove} disabled={disabled}>
            Remove drug {number}
          </Button>
        </div>
      ) : null}

      <div className={styles.fieldGrid}>
        <Input
          label="Drug name"
          value={value.drug}
          onChange={(event) => onChange({ ...value, drug: event.target.value })}
          placeholder="Paracetamol"
          disabled={disabled}
          required
        />
        <Input
          label="Dose"
          value={value.dose}
          onChange={(event) => onChange({ ...value, dose: event.target.value })}
          placeholder="500 mg"
          disabled={disabled}
        />
      </div>

      <Input
        label="Frequency"
        value={value.frequency}
        onChange={(event) => onChange({ ...value, frequency: event.target.value })}
        placeholder="Three times daily"
        disabled={disabled}
      />

      <div className={styles.times}>
        {value.times.map((time, timeIndex) => (
          <div className={styles.timeRow} key={`${index}-${timeIndex}`}>
            <TimePicker
              className={styles.timePicker}
              label={`Dose time ${timeIndex + 1} for drug ${number}`}
              value={time}
              onChange={(next) =>
                onChange({
                  ...value,
                  times: value.times.map((current, at) => (at === timeIndex ? next : current)),
                })
              }
              minuteStep={15}
              format="24h"
              disabled={disabled}
            />
            {value.times.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => onChange({ ...value, times: value.times.filter((_, at) => at !== timeIndex) })}
              >
                Remove time {timeIndex + 1}
              </Button>
            ) : null}
          </div>
        ))}
        <div className={styles.stepActions}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => onChange({ ...value, times: [...value.times, "20:00"] })}
          >
            Add another time
          </Button>
        </div>
      </div>
    </fieldset>
  );
}
