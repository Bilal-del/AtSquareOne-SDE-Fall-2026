import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { getApiErrorMessage } from '../api/auth'
import {
  archiveAdminJob, createAdminJob, getAdminJobs, restoreAdminJob, updateAdminJob,
  type AdminJob, type AdminJobPage, type JobFilter, type JobInput,
} from '../api/adminJobs'
import './AdminJobs.css'

const emptyForm: JobInput = { title: '', company: '', location: '', description: '' }

function dateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function AdminJobs() {
  const [data, setData] = useState<AdminJobPage | null>(null)
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [filter, setFilter] = useState<JobFilter>('all')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState<AdminJob | 'new' | null>(null)
  const [form, setForm] = useState<JobInput>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [archiving, setArchiving] = useState<AdminJob | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setData(await getAdminJobs(appliedSearch, filter, page)) }
    catch (err) { setError(getApiErrorMessage(err, 'Could not load administrator jobs.')) }
    finally { setLoading(false) }
  }, [appliedSearch, filter, page])
  useEffect(() => { void load() }, [load])

  function openForm(job?: AdminJob) {
    setEditing(job ?? 'new')
    setForm(job ? { title: job.title, company: job.company, location: job.location, description: job.description } : emptyForm)
    setFormError(null)
  }

  async function submitForm(event: FormEvent) {
    event.preventDefault()
    if (Object.values(form).some((value) => !value.trim())) {
      setFormError('Complete all required fields.'); return
    }
    setSaving(true); setFormError(null)
    try {
      if (editing === 'new') {
        await createAdminJob(form); setNotice('Job created and published successfully.')
      } else if (editing) {
        await updateAdminJob(editing.id, form); setNotice('Job changes saved successfully.')
      }
      setEditing(null); await load()
    } catch (err) { setFormError(getApiErrorMessage(err, 'Could not save this job.')) }
    finally { setSaving(false) }
  }

  async function confirmArchive() {
    if (!archiving) return
    try {
      await archiveAdminJob(archiving.id); setNotice(`${archiving.title} was archived.`); setArchiving(null); await load()
    } catch (err) { setError(getApiErrorMessage(err, 'Could not archive this job.')); setArchiving(null) }
  }

  async function restore(job: AdminJob) {
    try { await restoreAdminJob(job.id); setNotice(`${job.title} was restored.`); await load() }
    catch (err) { setError(getApiErrorMessage(err, 'Could not restore this job.')) }
  }

  return <section className="admin-jobs-page">
    <div className="admin-jobs-heading">
      <div><span className="admin-kicker">Staff workspace</span><h1>Job administration</h1><p>Create, update, archive, and restore SquareOne listings.</p></div>
      <button type="button" onClick={() => openForm()}>+ Create job</button>
    </div>

    <div className="admin-summary" aria-label="Job listing summary">
      <article><span>Active listings</span><strong>{data?.summary.active ?? '—'}</strong></article>
      <article><span>Archived listings</span><strong>{data?.summary.archived ?? '—'}</strong></article>
      <article><span>Total listings</span><strong>{data?.summary.total ?? '—'}</strong></article>
    </div>

    {notice && <div className="admin-notice" role="status">{notice}<button type="button" aria-label="Dismiss success message" onClick={() => setNotice(null)}>×</button></div>}
    <form className="admin-toolbar" role="search" onSubmit={(event) => { event.preventDefault(); setPage(1); setAppliedSearch(search.trim()) }}>
      <label><span>Search jobs</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Title or company" /></label>
      <button type="submit">Search</button>
      <label><span>Listing status</span><select aria-label="Filter by listing status" value={filter} onChange={(event) => { setPage(1); setFilter(event.target.value as JobFilter) }}><option value="all">All</option><option value="active">Active</option><option value="archived">Archived</option></select></label>
    </form>

    {loading && <div className="admin-state" role="status">Loading job listings…</div>}
    {error && <div className="admin-state admin-state--error" role="alert"><p>{error}</p><button type="button" onClick={() => void load()}>Try again</button></div>}
    {!loading && !error && data?.results.length === 0 && <div className="admin-state"><h2>No job listings found</h2><p>Adjust the search or status filter, or create a new job.</p></div>}
    {!loading && !error && data && data.results.length > 0 && <>
      <div className="admin-job-table"><table><thead><tr><th>Job</th><th>Location</th><th>Created</th><th>Status</th><th>Actions</th></tr></thead><tbody>{data.results.map((job) => <tr key={job.id}><td><strong>{job.title}</strong><span>{job.company}</span></td><td>{job.location}</td><td>{dateLabel(job.created_at)}</td><td><span className={`admin-status admin-status--${job.status}`}>{job.status}</span></td><td><div className="admin-row-actions"><button type="button" className="button-secondary" onClick={() => openForm(job)}>Edit</button>{job.status === 'active' ? <button type="button" className="button-danger" onClick={() => setArchiving(job)}>Archive</button> : <button type="button" onClick={() => void restore(job)}>Restore</button>}</div></td></tr>)}</tbody></table></div>
      <div className="admin-job-cards">{data.results.map((job) => <article key={job.id}><div><span className={`admin-status admin-status--${job.status}`}>{job.status}</span><h2>{job.title}</h2><p>{job.company} · {job.location}</p><small>Created {dateLabel(job.created_at)}</small></div><div className="admin-row-actions"><button type="button" className="button-secondary" onClick={() => openForm(job)}>Edit</button>{job.status === 'active' ? <button type="button" className="button-danger" onClick={() => setArchiving(job)}>Archive</button> : <button type="button" onClick={() => void restore(job)}>Restore</button>}</div></article>)}</div>
      <nav className="admin-pagination" aria-label="Job list pagination"><button type="button" disabled={!data.previous} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page}</span><button type="button" disabled={!data.next} onClick={() => setPage((value) => value + 1)}>Next</button></nav>
    </>}

    {editing && <div className="admin-modal-backdrop"><section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="job-form-title"><div className="admin-modal-heading"><div><span className="admin-kicker">{editing === 'new' ? 'New listing' : `Editing job #${editing.id}`}</span><h2 id="job-form-title">{editing === 'new' ? 'Create job' : `Edit ${editing.title}`}</h2></div><button type="button" aria-label="Close job form" onClick={() => setEditing(null)}>×</button></div><form onSubmit={submitForm}>{(['title', 'company', 'location'] as const).map((field) => <label key={field}><span>{field[0].toUpperCase() + field.slice(1)} *</span><input value={form[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })} required /></label>)}<label><span>Description *</span><textarea rows={7} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required /></label>{formError && <p role="alert" className="admin-form-error">{formError}</p>}<div className="admin-modal-actions"><button type="button" className="button-secondary" onClick={() => setEditing(null)}>Cancel</button><button type="submit" disabled={saving}>{saving ? 'Saving…' : editing === 'new' ? 'Create and publish' : 'Save changes'}</button></div></form></section></div>}
    {archiving && <div className="admin-modal-backdrop"><section className="admin-modal admin-modal--confirm" role="alertdialog" aria-modal="true" aria-labelledby="archive-title"><h2 id="archive-title">Archive job?</h2><p><strong>{archiving.title}</strong> will disappear from public job searches and details. Existing applications and their history will remain intact.</p><div className="admin-modal-actions"><button type="button" className="button-secondary" onClick={() => setArchiving(null)}>Cancel</button><button type="button" className="button-danger" onClick={() => void confirmArchive()}>Archive job</button></div></section></div>}
  </section>
}

export default AdminJobs
