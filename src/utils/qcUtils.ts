// QC (Quality Control) utility functions for naming convention parameter parsing and validation

export type QCState = 'waiting_for_final_qc' | 'qc' | 'pushed_live' | 'delivering';

export const QC_STATE_CODES: Record<string, QCState> = {
  'WF': 'waiting_for_final_qc',
  'QC': 'qc',
  'PL': 'pushed_live',
  'DLV': 'delivering',
};

export const QC_STATE_LABELS: Record<QCState, string> = {
  'waiting_for_final_qc': 'Waiting for Final QC',
  'qc': 'QC',
  'pushed_live': 'Pushed Live',
  'delivering': 'Delivering',
};

export const QC_STATE_TO_CODE: Record<QCState, string> = {
  'waiting_for_final_qc': 'WF',
  'qc': 'QC',
  'pushed_live': 'PL',
  'delivering': 'DLV',
};

// Ordered stages for sequential integrity validation
export const QC_STAGE_ORDER: QCState[] = [
  'waiting_for_final_qc',
  'qc',
  'pushed_live',
  'delivering',
];

export const DELIVERING_IMPRESSION_THRESHOLD = 1000;

/**
 * Parse QC parameter from the end of a naming convention string.
 * Expected format: ..._{other_params}_QC-{CODE}
 */
export function parseQCFromName(entityName: string): {
  qcState: QCState | null;
  qcRaw: string | null;
  isValid: boolean;
  error?: string;
  nameWithoutQC: string;
} {
  if (!entityName) {
    return { qcState: null, qcRaw: null, isValid: false, error: 'Entity name is empty', nameWithoutQC: '' };
  }

  // Split by underscore and check last segment
  const parts = entityName.split('_');
  const lastPart = parts[parts.length - 1];

  // Check if the last part matches QC-{CODE} pattern
  const qcMatch = lastPart.match(/^QC-(WF|QC|PL|DLV)$/i);

  if (!qcMatch) {
    // Check if QC parameter exists but not at the end
    const qcElsewhere = parts.findIndex((p, i) => i < parts.length - 1 && /^QC-(WF|QC|PL|DLV)$/i.test(p));
    if (qcElsewhere >= 0) {
      return {
        qcState: null,
        qcRaw: parts[qcElsewhere],
        isValid: false,
        error: 'QC parameter must be at the end of the naming convention',
        nameWithoutQC: parts.filter((_, i) => i !== qcElsewhere).join('_'),
      };
    }

    // Check for malformed QC parameter
    const malformed = parts.find(p => /^QC-/i.test(p));
    if (malformed) {
      return {
        qcState: null,
        qcRaw: malformed,
        isValid: false,
        error: `Invalid QC state value: "${malformed}". Valid values: QC-WF, QC-QC, QC-PL, QC-DLV`,
        nameWithoutQC: parts.filter(p => p !== malformed).join('_'),
      };
    }

    return {
      qcState: null,
      qcRaw: null,
      isValid: false,
      error: 'QC parameter is missing from the naming convention',
      nameWithoutQC: entityName,
    };
  }

  const code = qcMatch[1].toUpperCase();
  const qcState = QC_STATE_CODES[code];

  return {
    qcState,
    qcRaw: lastPart,
    isValid: true,
    nameWithoutQC: parts.slice(0, -1).join('_'),
  };
}

/**
 * Append QC parameter to entity name
 */
export function appendQCToName(entityName: string, state: QCState): string {
  const { nameWithoutQC } = parseQCFromName(entityName);
  const cleanName = nameWithoutQC || entityName;
  const code = QC_STATE_TO_CODE[state];
  return `${cleanName}_QC-${code}`;
}

/**
 * Remove QC parameter from entity name (used when delivering)
 */
export function removeQCFromName(entityName: string): string {
  const { nameWithoutQC } = parseQCFromName(entityName);
  return nameWithoutQC || entityName;
}

/**
 * Validate sequential integrity of a state transition
 */
export function isValidTransition(fromState: QCState | null, toState: QCState): {
  valid: boolean;
  skippedStages?: QCState[];
} {
  if (!fromState) return { valid: true }; // First state, any is valid

  const fromIndex = QC_STAGE_ORDER.indexOf(fromState);
  const toIndex = QC_STAGE_ORDER.indexOf(toState);

  if (toIndex <= fromIndex) {
    // Going backward - flag but allow (could be a correction)
    return { valid: true };
  }

  if (toIndex - fromIndex > 1) {
    const skipped = QC_STAGE_ORDER.slice(fromIndex + 1, toIndex);
    return { valid: false, skippedStages: skipped };
  }

  return { valid: true };
}

/**
 * Get QC badge color based on state
 */
export function getQCBadgeVariant(state: QCState): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (state) {
    case 'waiting_for_final_qc': return 'outline';
    case 'qc': return 'secondary';
    case 'pushed_live': return 'default';
    case 'delivering': return 'default';
    default: return 'outline';
  }
}

/**
 * Get QC badge color class
 */
export function getQCColorClass(state: QCState): string {
  switch (state) {
    case 'waiting_for_final_qc': return 'bg-amber-500/10 text-amber-700 border-amber-500/30';
    case 'qc': return 'bg-blue-500/10 text-blue-700 border-blue-500/30';
    case 'pushed_live': return 'bg-purple-500/10 text-purple-700 border-purple-500/30';
    case 'delivering': return 'bg-green-500/10 text-green-700 border-green-500/30';
    default: return '';
  }
}
