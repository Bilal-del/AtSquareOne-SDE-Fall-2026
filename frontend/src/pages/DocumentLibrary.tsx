import { isAxiosError } from 'axios';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  deleteDocument,
  DOCUMENT_CATEGORIES,
  getDocuments,
  openDocument,
  updateDocument,
  uploadDocument,
  type DocumentCategory,
  type LibraryDocument,
} from '../api/documents';
import './DocumentLibrary.css';

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'doc'];

function errorMessage(error: unknown, fallback: string) {
  if (isAxiosError(error)) {
    const data = error.response?.data as Record<string, string | string[]> | undefined;
    const first = data && Object.values(data)[0];
    if (Array.isArray(first)) return first[0];
    if (typeof first === 'string') return first;
  }
  return fallback;
}

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

function DocumentLibrary() {
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadDialogRef = useRef<HTMLDialogElement>(null);
  const editDialogRef = useRef<HTMLDialogElement>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>('resume');
  const [displayName, setDisplayName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<LibraryDocument | null>(null);
  const [deleting, setDeleting] = useState<LibraryDocument | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try { setDocuments(await getDocuments()); }
    catch { setError('Your documents could not be loaded.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const dialog = uploadDialogRef.current;
    if (uploadOpen && dialog && !dialog.open) dialog.showModal();
  }, [uploadOpen]);

  useEffect(() => {
    const dialog = editDialogRef.current;
    if (editing && dialog && !dialog.open) dialog.showModal();
  }, [editing]);

  useEffect(() => {
    const dialog = deleteDialogRef.current;
    if (deleting && dialog && !dialog.open) dialog.showModal();
  }, [deleting]);

  const visibleDocuments = documents.filter((document) => {
    const query = search.trim().toLowerCase();
    return (!query || document.display_name.toLowerCase().includes(query) || document.original_filename.toLowerCase().includes(query))
      && (!category || document.category === category);
  });

  function chooseFile(selected: File | null) {
    setOperationError(null);
    if (!selected) return setFile(null);
    const extension = selected.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXTENSIONS.includes(extension)) return setOperationError('Choose a PDF, DOCX, or DOC file.');
    if (selected.size > MAX_SIZE) return setOperationError('Documents must be 10 MB or smaller.');
    setFile(selected);
    setDisplayName(selected.name);
  }

  async function submitUpload(event: FormEvent) {
    event.preventDefault();
    if (!file) return setOperationError('Choose a document to upload.');
    setUploading(true); setOperationError(null);
    try {
      const created = await uploadDocument(file, uploadCategory, displayName.trim() || file.name);
      setDocuments((current) => [created, ...current]);
      setUploadOpen(false); setFile(null); setDisplayName('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (uploadError) { setOperationError(errorMessage(uploadError, 'The document could not be uploaded.')); }
    finally { setUploading(false); }
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setOperationError(null);
    try {
      const updated = await updateDocument(editing.id, { display_name: editing.display_name, category: editing.category });
      setDocuments((current) => current.map((item) => item.id === updated.id ? updated : item));
      setEditing(null);
    } catch (editError) { setOperationError(errorMessage(editError, 'The document could not be updated.')); }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setOperationError(null);
    try {
      await deleteDocument(deleting.id);
      setDocuments((current) => current.filter((item) => item.id !== deleting.id));
      setDeleting(null);
    } catch (deleteError) { setOperationError(errorMessage(deleteError, 'The document could not be deleted.')); }
  }

  function closeUploadDialog() {
    if (uploading) return;
    uploadDialogRef.current?.close();
    setUploadOpen(false);
    setOperationError(null);
  }

  function closeEditDialog() {
    editDialogRef.current?.close();
    setEditing(null);
    setOperationError(null);
  }

  function closeDeleteDialog() {
    deleteDialogRef.current?.close();
    setDeleting(null);
    setOperationError(null);
  }

  return <section className="document-library" aria-labelledby="document-library-heading">
    <div className="document-library__hero">
      <div><span className="document-library__eyebrow">Your career workspace</span><h1 id="document-library-heading">Document Library</h1><p>Keep resumes and supporting documents ready for every application.</p></div>
      <button type="button" onClick={() => { setOperationError(null); setUploadOpen(true); }}>+ Upload document</button>
    </div>
    <div className="document-library__tools">
      <label><span className="sr-only">Search documents</span><input type="search" placeholder="Search documents" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <label><span className="sr-only">Filter by category</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{DOCUMENT_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
    </div>
    {operationError && !uploadOpen && !editing && !deleting && <p className="document-library__error" role="alert">{operationError}</p>}
    {loading && <p role="status" className="document-library__state">Loading your documents…</p>}
    {error && <div className="document-library__state" role="alert"><p>{error}</p><button type="button" onClick={load}>Try again</button></div>}
    {!loading && !error && visibleDocuments.length === 0 && <div className="document-library__state"><strong>{documents.length ? 'No documents match your filters.' : 'Your library is ready.'}</strong><p>{documents.length ? 'Try another name or category.' : 'Upload your first resume, cover letter, or credential.'}</p></div>}
    {!loading && !error && visibleDocuments.length > 0 && <ul className="document-grid">{visibleDocuments.map((document) => <li className="document-card" key={document.id}>
      <div className={`document-card__icon document-card__icon--${document.file_extension}`}>{document.file_extension.toUpperCase()}</div>
      <div className="document-card__body"><div className="document-card__heading"><div><h2>{document.display_name}</h2><span>{document.category_label} · {formatSize(document.file_size)}</span></div><span className="badge">{document.file_extension.toUpperCase()}</span></div>
      <p>Uploaded {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(document.uploaded_at))}</p>
      <p>{document.linked_applications.length ? `Linked to ${document.linked_applications.map((item) => `${item.job_title} at ${item.company}`).join(', ')}` : 'Not linked to an application'}</p>
      <div className="document-card__actions">{document.file_extension === 'pdf' && <button type="button" onClick={() => void openDocument(document, 'inline')}>View</button>}<button type="button" onClick={() => void openDocument(document, 'attachment')}>Download</button><button type="button" onClick={() => setEditing({ ...document })}>Edit</button><button className="document-card__delete" type="button" onClick={() => setDeleting(document)}>Delete</button></div></div>
    </li>)}</ul>}

    {uploadOpen && <dialog ref={uploadDialogRef} className="document-modal" aria-labelledby="upload-heading" onCancel={(event) => { event.preventDefault(); if (!uploading) closeUploadDialog(); }} onClose={() => { if (!uploading) { setUploadOpen(false); setOperationError(null); } }}><form onSubmit={submitUpload}><div className="document-modal__heading"><div><span>Private S3 storage</span><h2 id="upload-heading">Upload document</h2></div><button type="button" aria-label="Close upload dialog" onClick={closeUploadDialog}>×</button></div><label>File (PDF, DOCX, or DOC · max 10 MB)<input ref={fileRef} type="file" accept=".pdf,.doc,.docx" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} /></label><label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label>Category<select value={uploadCategory} onChange={(event) => setUploadCategory(event.target.value as DocumentCategory)}>{DOCUMENT_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>{operationError && <p className="document-library__error" role="alert">{operationError}</p>}<div className="document-modal__actions"><button type="button" className="secondary" onClick={closeUploadDialog}>Cancel</button><button type="submit" disabled={uploading}>{uploading ? 'Uploading…' : 'Upload document'}</button></div></form></dialog>}
    {editing && <dialog ref={editDialogRef} className="document-modal" aria-labelledby="edit-document-heading" onCancel={(event) => { event.preventDefault(); closeEditDialog(); }} onClose={() => { setEditing(null); setOperationError(null); }}><form onSubmit={saveEdit}><div className="document-modal__heading"><h2 id="edit-document-heading">Edit document</h2><button type="button" aria-label="Close edit dialog" onClick={closeEditDialog}>×</button></div><label>Display name<input required value={editing.display_name} onChange={(event) => setEditing({ ...editing, display_name: event.target.value })} /></label><label>Category<select value={editing.category} onChange={(event) => setEditing({ ...editing, category: event.target.value as DocumentCategory })}>{DOCUMENT_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>{operationError && <p className="document-library__error" role="alert">{operationError}</p>}<div className="document-modal__actions"><button type="button" className="secondary" onClick={closeEditDialog}>Cancel</button><button type="submit">Save changes</button></div></form></dialog>}
    {deleting && <dialog ref={deleteDialogRef} className="document-modal" aria-labelledby="delete-document-heading" onCancel={(event) => { event.preventDefault(); closeDeleteDialog(); }} onClose={() => { setDeleting(null); setOperationError(null); }}><div className="document-modal__heading"><h2 id="delete-document-heading">Delete document?</h2></div><p>This permanently deletes “{deleting.display_name}” from your library and detaches it from every application. Applications will not be deleted.</p>{operationError && <p className="document-library__error" role="alert">{operationError}</p>}<div className="document-modal__actions"><button type="button" className="secondary" onClick={closeDeleteDialog}>Cancel</button><button type="button" className="danger" onClick={confirmDelete}>Delete document</button></div></dialog>}
  </section>;
}

export default DocumentLibrary;
