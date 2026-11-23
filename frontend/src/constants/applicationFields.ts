export const WORK_ARRANGEMENTS = [
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'on_site', label: 'On-site' },
] as const;

export type WorkArrangement = (typeof WORK_ARRANGEMENTS)[number]['value'] | '';

export const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'internship', label: 'Internship' },
  { value: 'contract', label: 'Contract' },
] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number]['value'] | '';
