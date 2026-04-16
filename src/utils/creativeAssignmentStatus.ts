export const PUSHED_ASSIGNMENT_STATUSES = ['published', 'pushed_live', 'pushed', 'delivering'] as const;

export function normalizeAssignmentPushStatus(
  status?: string | null,
  dspCreativeId?: string | null,
): string {
  const normalizedStatus = status?.trim().toLowerCase();

  if (normalizedStatus) {
    return normalizedStatus;
  }

  return dspCreativeId ? 'pushed' : 'draft';
}

export function isAssignmentPushedLive(
  status?: string | null,
  dspCreativeId?: string | null,
): boolean {
  const normalizedStatus = normalizeAssignmentPushStatus(status, dspCreativeId);

  return Boolean(dspCreativeId) || PUSHED_ASSIGNMENT_STATUSES.includes(normalizedStatus as (typeof PUSHED_ASSIGNMENT_STATUSES)[number]);
}