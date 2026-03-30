// QC (Quality Control) utility functions

export type QCState = 'waiting_for_final_qc' | 'qc' | 'pushed_live' | 'delivering';

export const QC_STATE_LABELS: Record<QCState, string> = {
  'waiting_for_final_qc': 'Waiting for Final Check',
  'qc': 'Checked',
  'pushed_live': 'Pushed Live',
  'delivering': 'Delivering',
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
 * Validate sequential integrity of a state transition
 */
export function isValidTransition(fromState: QCState | null, toState: QCState): {
  valid: boolean;
  skippedStages?: QCState[];
} {
  if (!fromState) return { valid: true };

  const fromIndex = QC_STAGE_ORDER.indexOf(fromState);
  const toIndex = QC_STAGE_ORDER.indexOf(toState);

  if (toIndex <= fromIndex) {
    return { valid: true };
  }

  if (toIndex - fromIndex > 1) {
    const skipped = QC_STAGE_ORDER.slice(fromIndex + 1, toIndex);
    return { valid: false, skippedStages: skipped };
  }

  return { valid: true };
}

/**
 * Get the next allowed QC state
 */
export function getNextState(currentState: QCState): QCState | null {
  const idx = QC_STAGE_ORDER.indexOf(currentState);
  if (idx < 0 || idx >= QC_STAGE_ORDER.length - 1) return null;
  return QC_STAGE_ORDER[idx + 1];
}

/**
 * Get the previous QC state (for undo/rollback)
 */
export function getPreviousState(currentState: QCState): QCState | null {
  const idx = QC_STAGE_ORDER.indexOf(currentState);
  if (idx <= 0) return null;
  return QC_STAGE_ORDER[idx - 1];
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

/**
 * Get QC state icon color for use with Tailwind
 */
export function getQCIconColor(state: QCState): string {
  switch (state) {
    case 'waiting_for_final_qc': return 'text-amber-500';
    case 'qc': return 'text-blue-500';
    case 'pushed_live': return 'text-purple-500';
    case 'delivering': return 'text-green-500';
    default: return 'text-muted-foreground';
  }
}
