import apiClient from './client'
import type { Job } from './jobs'

export type JobState = 'active' | 'archived'
export type JobFilter = JobState | 'all'
export interface AdminJob extends Job { deleted_at: string | null; status: JobState }
export interface JobInput { title: string; company: string; location: string; description: string }
export interface AdminJobPage {
  count: number
  next: string | null
  previous: string | null
  results: AdminJob[]
  summary: { active: number; archived: number; total: number }
}

export async function getAdminJobs(search = '', archiveState: JobFilter = 'all', page = 1) {
  const { data } = await apiClient.get<AdminJobPage>('/admin/jobs/', {
    params: { search: search || undefined, archive_state: archiveState, page },
  })
  return data
}
export async function createAdminJob(input: JobInput) {
  return (await apiClient.post<AdminJob>('/admin/jobs/', input)).data
}
export async function updateAdminJob(id: number, input: JobInput) {
  return (await apiClient.patch<AdminJob>(`/admin/jobs/${id}/`, input)).data
}
export async function archiveAdminJob(id: number) {
  return (await apiClient.post<AdminJob>(`/admin/jobs/${id}/archive/`)).data
}
export async function restoreAdminJob(id: number) {
  return (await apiClient.post<AdminJob>(`/admin/jobs/${id}/restore/`)).data
}
