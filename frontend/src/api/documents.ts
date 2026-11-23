import apiClient from './client';

export type DocumentCategory = 'resume' | 'cover_letter' | 'certificate' | 'transcript' | 'other';

export const DOCUMENT_CATEGORIES: { value: DocumentCategory; label: string }[] = [
  { value: 'resume', label: 'Resume' },
  { value: 'cover_letter', label: 'Cover Letter' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'transcript', label: 'Transcript' },
  { value: 'other', label: 'Other' },
];

export interface DocumentApplicationLink {
  id: number;
  job_title: string;
  company: string;
  attached_at: string;
}

export interface LibraryDocument {
  id: number;
  original_filename: string;
  display_name: string;
  category: DocumentCategory;
  category_label: string;
  file_extension: string;
  file_size: number;
  content_type: string;
  uploaded_at: string;
  linked_applications: DocumentApplicationLink[];
}

interface PaginatedDocuments {
  results: LibraryDocument[];
  next: string | null;
}

export async function getDocuments(filters?: { search?: string; category?: string }) {
  const response = await apiClient.get<PaginatedDocuments | LibraryDocument[]>('/documents/', { params: filters });
  if (Array.isArray(response.data)) return response.data;
  const documents = [...response.data.results];
  let next = response.data.next;
  let pageCount = 1;
  while (next) {
    const apiBase = new URL(apiClient.defaults.baseURL ?? '/api/', window.location.origin);
    const nextUrl = new URL(next, apiBase);
    if (nextUrl.origin !== apiBase.origin || !nextUrl.pathname.endsWith('/documents/')) {
      throw new Error('Refusing an unsafe document pagination URL.');
    }
    if (pageCount >= 1000) throw new Error('Document pagination limit exceeded.');
    const page = await apiClient.get<PaginatedDocuments>(`${nextUrl.pathname.replace(apiBase.pathname.replace(/\/$/, ''), '')}${nextUrl.search}`);
    documents.push(...page.data.results);
    next = page.data.next;
    pageCount += 1;
  }
  return documents;
}

export async function uploadDocument(file: File, category: DocumentCategory, displayName: string) {
  const form = new FormData();
  form.append('file', file);
  form.append('category', category);
  form.append('display_name', displayName);
  const response = await apiClient.post<LibraryDocument>('/documents/', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function updateDocument(id: number, changes: { display_name?: string; category?: DocumentCategory }) {
  const response = await apiClient.patch<LibraryDocument>(`/documents/${id}/`, changes);
  return response.data;
}

export async function deleteDocument(id: number) {
  await apiClient.delete(`/documents/${id}/`);
}

export async function openDocument(document: LibraryDocument, disposition: 'inline' | 'attachment') {
  // Open during the user gesture so browser popup protection does not block
  // the destination after the authorization request completes.
  const target = window.open('about:blank', '_blank');
  try {
    const response = await apiClient.post<{ url: string }>(`/documents/${document.id}/access/`, { disposition });
    if (target) {
      target.location.replace(response.data.url);
    } else window.location.assign(response.data.url);
  } catch (error) {
    target?.close();
    throw error;
  }
}

export async function getApplicationDocuments(applicationId: number) {
  const response = await apiClient.get<LibraryDocument[]>(`/applications/${applicationId}/documents/`);
  return response.data;
}

export async function attachApplicationDocument(applicationId: number, documentId: number) {
  const response = await apiClient.post<LibraryDocument>(`/applications/${applicationId}/documents/`, { document_id: documentId });
  return response.data;
}

export async function detachApplicationDocument(applicationId: number, documentId: number) {
  await apiClient.delete(`/applications/${applicationId}/documents/${documentId}/`);
}
