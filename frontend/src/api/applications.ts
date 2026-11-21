import apiClient from './client';
import type {
  EmploymentType,
  WorkArrangement,
} from '../constants/applicationFields';
import type { ApplicationStatus } from '../constants/applicationStatuses';

export type { ApplicationStatus } from '../constants/applicationStatuses';

export interface Application {
    id: number;
    job: number | null;
    job_title: string;
    company: string;
    source: 'squareone' | 'manual';
    location: string;
    external_job_url: string;
    work_arrangement: WorkArrangement;
    employment_type: EmploymentType;
    status: ApplicationStatus;
    applied_date: string | null;
    notes: string;
    archived_at: string | null;
    created_at: string;
    updated_at: string;
}

interface ApplicationPersonalFields {
  status?: ApplicationStatus;
  applied_date?: string | null;
  location?: string;
  external_job_url?: string;
  work_arrangement?: WorkArrangement;
  employment_type?: EmploymentType;
  notes?: string;
}

export interface CreateLinkedApplicationInput extends ApplicationPersonalFields {
  job: number;
}

export interface CreateManualApplicationInput extends ApplicationPersonalFields {
  job?: null;
  job_title: string;
  company: string;
}

export type CreateApplicationInput =
  | CreateLinkedApplicationInput
  | CreateManualApplicationInput;

export type UpdateApplicationInput = Partial<
  Pick<
    Application,
    | 'job_title'
    | 'company'
    | 'location'
    | 'external_job_url'
    | 'work_arrangement'
    | 'employment_type'
    | 'status'
    | 'applied_date'
    | 'notes'
  >
>;

export interface ApplicationDuplicate {
  id: number;
  job: number | null;
  job_title: string;
  company: string;
  source: Application['source'];
  status: ApplicationStatus;
  archived_at: string | null;
}

export interface ApplicationListFilters {
  archive_state?: 'active' | 'archived' | 'all';
  status?: ApplicationStatus;
  search?: string;
}

export interface PaginatedApplications {
    count: number;
    next: string | null;
    previous: string | null;
    results: Application[];
}

export async function getApplications(
  filters?: ApplicationListFilters,
): Promise<PaginatedApplications> {
    const response = await apiClient.get<PaginatedApplications>('/applications/', {
      params: filters,
    });
    return response.data;
}

const MAX_APPLICATION_PAGES = 1000;

function getSafePaginationPath(paginationUrl: string): string {
    const configuredBaseUrl = apiClient.defaults.baseURL;

    if (!configuredBaseUrl) {
        throw new Error('The API client does not have a configured base URL.');
    }

    const apiBaseUrl = new URL(configuredBaseUrl, window.location.origin);
    const nextPageUrl = new URL(paginationUrl, apiBaseUrl);

    if (nextPageUrl.origin !== apiBaseUrl.origin) {
        throw new Error('Refusing to follow a pagination URL on another origin.');
    }

    const apiBasePath = apiBaseUrl.pathname.replace(/\/$/, '');
    const applicationsPath = `${apiBasePath}/applications/`;

    if (nextPageUrl.pathname !== applicationsPath) {
        throw new Error(
            'Refusing to follow an unexpected applications pagination path.',
        );
    }

    return `/applications/${nextPageUrl.search}`;
}

export async function getAllApplications(
  filters?: ApplicationListFilters,
): Promise<Application[]> {
    const applications: Application[] = [];
    const visitedPages = new Set<string>(['/applications/']);
    let page = await getApplications(filters);
    let pageCount = 1;

    applications.push(...page.results);

    while (page.next) {
        const nextPagePath = getSafePaginationPath(page.next);

        if (visitedPages.has(nextPagePath)) {
            throw new Error(
                'The applications API returned a repeated pagination URL.',
            );
        }

        if (pageCount >= MAX_APPLICATION_PAGES) {
            throw new Error(
                'The applications API exceeded the pagination safety limit.',
            );
        }

        visitedPages.add(nextPagePath);
        const response = await apiClient.get<PaginatedApplications>(nextPagePath);
        page = response.data;
        applications.push(...page.results);
        pageCount += 1;
    }

  return applications;
}

export async function createApplication(
  input: CreateApplicationInput,
): Promise<Application> {
  const response = await apiClient.post<Application>('/applications/', input);
  return response.data;
}

export async function updateApplication(
  id: number,
  changes: UpdateApplicationInput,
): Promise<Application> {
  const response = await apiClient.patch<Application>(
    `/applications/${id}/`,
    changes,
  );
  return response.data;
}

export async function deleteApplication(id: number): Promise<void> {
  await apiClient.delete(`/applications/${id}/`);
}

export interface DuplicateLookupInput {
  job?: number;
  job_title?: string;
  company?: string;
}

export async function findApplicationDuplicates(
  input: DuplicateLookupInput,
  signal?: AbortSignal,
): Promise<ApplicationDuplicate[]> {
  const response = await apiClient.get<ApplicationDuplicate[]>(
    '/applications/duplicates/',
    { params: input, signal },
  );
  return response.data;
}

export async function archiveApplication(id: number): Promise<Application> {
  const response = await apiClient.post<Application>(
    `/applications/${id}/archive/`,
  );
  return response.data;
}

export async function restoreApplication(id: number): Promise<Application> {
  const response = await apiClient.post<Application>(
    `/applications/${id}/restore/`,
  );
  return response.data;
}
