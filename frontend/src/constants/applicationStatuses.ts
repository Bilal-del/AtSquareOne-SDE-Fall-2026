export const APPLICATION_STATUSES = [
  { value: 'saved', label: 'Saved' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offered', label: 'Offered' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'closed', label: 'Closed' },
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]['value'];

export const APPLICATION_STATUS_LABELS = Object.fromEntries(
  APPLICATION_STATUSES.map(({ value, label }) => [value, label]),
) as Record<ApplicationStatus, string>;

export const DEFAULT_APPLICATION_STATUS: ApplicationStatus = 'saved';
