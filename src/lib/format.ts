import type { Fact, FactFlag, FactStatus, FactType } from '../engine/types';
import { FLAG_LABEL, STATUS_LABEL } from '../engine/types';

export type Tone = 'ok' | 'warn' | 'critical' | 'info' | 'muted' | 'external';

/** Status → colour tone. Discontinued and resolved are warnings, not errors. */
export function statusTone(status: FactStatus): Tone {
  switch (status) {
    case 'active':
      return 'ok';
    case 'discontinued':
    case 'resolved':
      return 'warn';
    case 'historical':
    case 'unknown':
      return 'muted';
    case 'completed':
      return 'info';
    default:
      return 'muted';
  }
}

export function statusLabel(status: FactStatus): string {
  return STATUS_LABEL[status];
}

/** Fact flags → tone. Implausible and critical values outrank everything. */
export function factTone(fact: Fact): Tone {
  if (fact.flags.includes('critical_value')) return 'critical';
  if (fact.flags.includes('implausible_value')) return 'critical';
  if (fact.flags.includes('outside_reference_range')) return 'warn';
  if (fact.flags.includes('negative_finding')) return 'muted';
  return statusTone(fact.status);
}

export function factTypeClass(type: FactType): string {
  return `is-${type}`;
}

export function confidenceTone(confidence: number): string {
  if (confidence >= 0.8) return '';
  if (confidence >= 0.6) return 'is-low';
  return 'is-verylow';
}

export function flagLabels(flags: FactFlag[]): string[] {
  return flags.map((f) => FLAG_LABEL[f]);
}

export function flagTone(flag: FactFlag): Tone {
  if (flag === 'critical_value' || flag === 'implausible_value') return 'critical';
  if (flag === 'outside_reference_range' || flag === 'unit_unusual' || flag === 'ambiguous_status')
    return 'warn';
  if (flag === 'section_derived_status' || flag === 'unit_inferred' || flag === 'ambiguous_text')
    return 'info';
  return 'muted';
}

export function formatValue(fact: Fact): string {
  if (fact.valueNum !== undefined) {
    const comparator = fact.comparator ?? '';
    return `${comparator}${fact.valueNum}${fact.unit ? ` ${fact.unit}` : ''}`;
  }
  const text = fact.attrs.valueText ?? fact.valueText;
  if (text) return String(text);
  return STATUS_LABEL[fact.status];
}

export function referenceRangeText(fact: Fact): string {
  const ref = fact.referenceRange;
  if (!ref) return 'not stated';
  if (ref.text) return ref.text;
  const low = ref.low !== undefined ? String(ref.low) : '';
  const high = ref.high !== undefined ? String(ref.high) : '';
  if (low && high) return `${low} – ${high}`;
  if (high) return `< ${high}`;
  if (low) return `> ${low}`;
  return 'not stated';
}

export function pct(value: number | null): string {
  if (value === null) return '—';
  return `${value > 0 ? '+' : ''}${value}%`;
}

export function plural(count: number, singular: string, pluralWord?: string): string {
  return `${count} ${count === 1 ? singular : (pluralWord ?? `${singular}s`)}`;
}

/** Percentage of a whole, clamped, for inline bars. */
export function share(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.max(0, Math.min(1, part / whole));
}
