import apiClient from './client';

export interface Job {
  id: number;
  title: string;
  company: string;
  location: string;
  description: string;
  created_at: string;
}

export interface PaginatedJobs {
    count: number;
    next: string | null;
    previous: string | null;
    results: Job[];
}

export async function getJobs(): Promise<PaginatedJobs> {
  const response = await apiClient.get<PaginatedJobs>('/jobs/');
  return response.data;
}

const MAX_JOB_PAGES = 1000;

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
  const jobsPath = `${apiBasePath}/jobs/`;

  if (nextPageUrl.pathname !== jobsPath) {
    throw new Error('Refusing to follow an unexpected jobs pagination path.');
  }

  return `/jobs/${nextPageUrl.search}`;
}

export async function getAllJobs(): Promise<Job[]> {
  const jobs: Job[] = [];
  const visitedPages = new Set<string>();
  let page = await getJobs();
  let pageCount = 1;

  jobs.push(...page.results);

  while (page.next) {
    const nextPagePath = getSafePaginationPath(page.next);

    if (visitedPages.has(nextPagePath)) {
      throw new Error('The jobs API returned a repeated pagination URL.');
    }

    if (pageCount >= MAX_JOB_PAGES) {
      throw new Error('The jobs API exceeded the pagination safety limit.');
    }

    visitedPages.add(nextPagePath);
    const response = await apiClient.get<PaginatedJobs>(nextPagePath);
    page = response.data;
    jobs.push(...page.results);
    pageCount += 1;
  }

  return jobs;
}

export async function getJobById(id: number): Promise<Job> {
    const response = await apiClient.get<Job>(`/jobs/${id}/`);
    return response.data;
}
