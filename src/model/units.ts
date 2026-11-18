/**
 * Dimensional Unit & Provenance System
 *
 * Internal coordinate and dimension unit is ALWAYS metres (1.0 = 1.00 metre).
 * Supports defining dimensions in metres (m) or centimetres (cm), while strictly
 * tracking provenance for every measurement in the source of truth.
 */

export type ProvenanceType =
  | 'verified_drawing' // Verified from Verkooptekening VK-06 or Tekening woonwensen 55.1-55.3
  | 'user_supplied'    // Supplied by user via HomeByMe floor layouts or Garden layout
  | 'calculated'       // Mathematically derived from verified/user measurements
  | 'assumed';         // Standard Dutch Bouwbesluit / architectural assumption where not explicitly written

export interface Dimension {
  /** Dimension value in metres (internal canonical unit) */
  readonly metres: number;
  /** Original input value for display/audit */
  readonly rawInput: number;
  /** Original input unit ('m' | 'cm') */
  readonly unit: 'm' | 'cm';
  /** Provenance category */
  readonly provenance: ProvenanceType;
  /** Citation of the exact document or calculation */
  readonly source: string;
}

/**
 * Define a measurement in metres (m) with explicit provenance.
 */
export function m(
  valueMetres: number,
  provenance: ProvenanceType,
  source: string
): Dimension {
  return {
    metres: Number(valueMetres.toFixed(4)),
    rawInput: valueMetres,
    unit: 'm',
    provenance,
    source,
  };
}

/**
 * Define a measurement in centimetres (cm) with explicit provenance.
 * Automatically converts to canonical metres (1 cm = 0.01 m).
 */
export function cm(
  valueCentimetres: number,
  provenance: ProvenanceType,
  source: string
): Dimension {
  return {
    metres: Number((valueCentimetres / 100).toFixed(4)),
    rawInput: valueCentimetres,
    unit: 'cm',
    provenance,
    source,
  };
}

/**
 * Format a Dimension for human-readable display in the UI / Audit overlay.
 */
export function formatDimension(dim: Dimension, preferCmUnder1m = false): string {
  if (preferCmUnder1m && Math.abs(dim.metres) < 1.0) {
    const cmVal = Number((dim.metres * 100).toFixed(1));
    return `${cmVal} cm`;
  }
  return `${dim.metres.toFixed(2)} m`;
}

export const PROVENANCE_LABELS: Record<ProvenanceType, string> = {
  verified_drawing: 'Verified (Builder Drawing VK-06 / 55.1–55.3)',
  user_supplied: 'User Supplied (HomeByMe / Garden Plan)',
  calculated: 'Calculated (Derived from Verified Chain)',
  assumed: 'Assumed (Standard Dutch Bouwbesluit Detail)',
};
