import apiClient from './client';

export type ApplicationStatus =
    | 'saved'
    | 'applied'
    | 'interviewing'
    | 'offered'
    | 'rejected';

export interface Application {
    id: number;
    job: number | null;
    job_title: string;
    company: string;
    status: ApplicationStatus;
    applied_date: string | null;
    notes: string;
    created_at: string;
    updated_at: string;
}

export interface CreateApplicationInput {
  job: number;
  status?: ApplicationStatus;
  applied_date?: string | null;
  notes?: string;
}

export type UpdateApplicationInput = Partial<
  Pick<Application, 'status' | 'applied_date' | 'notes'>
>;

export interface PaginatedApplications {
    count: number;
    next: string | null;
    previous: string | null;
    results: Application[];
}

export async function getApplications(): Promise<PaginatedApplications> {
    const response = await apiClient.get<PaginatedApplications>('/applications/');
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

export async function getAllApplications(): Promise<Application[]> {
    const applications: Application[] = [];
    const visitedPages = new Set<string>(['/applications/']);
    let page = await getApplications();
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
