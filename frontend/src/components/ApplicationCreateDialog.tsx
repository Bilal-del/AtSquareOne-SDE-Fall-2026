import { isAxiosError } from 'axios';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  createApplication,
  findApplicationDuplicates,
  type Application,
  type ApplicationDuplicate,
} from '../api/applications';
import {
  EMPLOYMENT_TYPES,
  WORK_ARRANGEMENTS,
  type EmploymentType,
  type WorkArrangement,
} from '../constants/applicationFields';
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
  DEFAULT_APPLICATION_STATUS,
  type ApplicationStatus,
} from '../constants/applicationStatuses';

interface ApplicationCreateDialogProps {
  onClose: () => void;
  onCreated: (application: Application) => void;
}

function ApplicationCreateDialog({
  onClose,
  onCreated,
}: ApplicationCreateDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const submissionPending = useRef(false);
  const duplicateRequestId = useRef(0);
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [appliedDate, setAppliedDate] = useState('');
  const [status, setStatus] = useState<ApplicationStatus>(
    DEFAULT_APPLICATION_STATUS,
  );
  const [externalJobUrl, setExternalJobUrl] = useState('');
  const [workArrangement, setWorkArrangement] = useState<WorkArrangement>('');
  const [employmentType, setEmploymentType] = useState<EmploymentType>('');
  const [notes, setNotes] = useState('');
  const [duplicates, setDuplicates] = useState<ApplicationDuplicate[]>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    const normalizedTitle = jobTitle.trim();
    const normalizedCompany = company.trim();
    const requestId = duplicateRequestId.current + 1;
    duplicateRequestId.current = requestId;

    if (!normalizedTitle || !normalizedCompany) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setCheckingDuplicates(true);
      try {
        const matches = await findApplicationDuplicates(
          {
            job_title: normalizedTitle,
            company: normalizedCompany,
          },
          controller.signal,
        );
        if (duplicateRequestId.current === requestId) {
          setDuplicates(matches);
        }
      } catch (error) {
        if (
          duplicateRequestId.current === requestId &&
          !(isAxiosError(error) && error.code === 'ERR_CANCELED')
        ) {
          setDuplicateError(
            'Duplicate check is temporarily unavailable. You can still save this application.',
          );
        }
      } finally {
        if (duplicateRequestId.current === requestId) {
          setCheckingDuplicates(false);
        }
      }
    }, 400);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
      if (duplicateRequestId.current === requestId) {
        duplicateRequestId.current += 1;
      }
    };
  }, [company, jobTitle]);

  function updateDuplicateIdentity(
    setter: (value: string) => void,
    value: string,
    field: 'job_title' | 'company',
  ) {
    duplicateRequestId.current += 1;
    setter(value);
    setDuplicates([]);
    setDuplicateError(null);
    setCheckingDuplicates(false);

    if (value.trim()) {
      setFieldErrors((currentErrors) => {
        if (!currentErrors[field]) return currentErrors;

        const nextErrors = { ...currentErrors };
        delete nextErrors[field];
        return nextErrors;
      });
    }

    const requiredFieldsAreValid = field === 'job_title'
      ? Boolean(value.trim() && company.trim())
      : Boolean(jobTitle.trim() && value.trim());
    if (
      requiredFieldsAreValid &&
      formError === 'Enter the required application information.'
    ) {
      setFormError(null);
    }
  }

  function closeDialog() {
    if (!submitting) {
      dialogRef.current?.close();
      onClose();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionPending.current) return;

    const trimmedTitle = jobTitle.trim();
    const trimmedCompany = company.trim();
    const clientErrors: Record<string, string> = {};
    if (!trimmedTitle) clientErrors.job_title = 'Job title is required.';
    if (!trimmedCompany) clientErrors.company = 'Company name is required.';
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      setFormError('Enter the required application information.');
      return;
    }

    submissionPending.current = true;
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const application = await createApplication({
        job_title: trimmedTitle,
        company: trimmedCompany,
        location: location.trim(),
        applied_date: appliedDate || null,
        status,
        external_job_url: externalJobUrl.trim(),
        work_arrangement: workArrangement,
        employment_type: employmentType,
        notes,
      });
      dialogRef.current?.close();
      onCreated(application);
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 400) {
        const responseData = error.response.data;
        const errors: Record<string, string> = {};
        if (responseData && typeof responseData === 'object') {
          Object.entries(responseData as Record<string, unknown>).forEach(
            ([field, value]) => {
              errors[field] = Array.isArray(value)
                ? value.join(' ')
                : String(value);
            },
          );
        }
        setFieldErrors(errors);
        setFormError('Review the highlighted fields and try again.');
      } else if (isAxiosError(error) && !error.response) {
        setFormError(
          'The SquareOne API could not be reached. The application was not saved.',
        );
      } else if (
        isAxiosError(error) &&
        (error.response?.status === 401 || error.response?.status === 403)
      ) {
        setFormError('You are not authorized to create this application.');
      } else {
        setFormError('The application could not be saved. Please try again.');
      }
    } finally {
      submissionPending.current = false;
      setSubmitting(false);
    }
  }

  return (
    <dialog
      className="application-dialog application-dialog--wide"
      ref={dialogRef}
      aria-labelledby="create-application-title"
      onCancel={(event) => {
        if (submitting) event.preventDefault();
        else onClose();
      }}
      onClose={() => {
        if (!submitting) onClose();
      }}
    >
      <form method="dialog" onSubmit={handleSubmit}>
        <div className="application-dialog__heading">
          <div>
            <span className="application-dialog__eyebrow">Manual application</span>
            <h2 id="create-application-title">Add an application</h2>
            <p>Track an opportunity that is not listed in SquareOne.</p>
          </div>
          <button
            className="application-dialog__close"
            type="button"
            aria-label="Close add application dialog"
            disabled={submitting}
            onClick={closeDialog}
          >
            ×
          </button>
        </div>

        <div className="application-dialog__grid">
          <label className="application-dialog__field">
            <span>Job title *</span>
            <input
              value={jobTitle}
              onChange={(event) => updateDuplicateIdentity(
                setJobTitle,
                event.target.value,
                'job_title',
              )}
              autoComplete="organization-title"
            />
            {fieldErrors.job_title && <small role="alert">{fieldErrors.job_title}</small>}
          </label>

          <label className="application-dialog__field">
            <span>Company name *</span>
            <input
              value={company}
              onChange={(event) => updateDuplicateIdentity(
                setCompany,
                event.target.value,
                'company',
              )}
              autoComplete="organization"
            />
            {fieldErrors.company && <small role="alert">{fieldErrors.company}</small>}
          </label>
        </div>

        <div className="application-duplicate-check" aria-live="polite">
          {checkingDuplicates && <span>Checking for potential duplicates…</span>}
          {duplicateError && <span>{duplicateError}</span>}
          {!checkingDuplicates && duplicates.length > 0 && (
            <div>
              <strong>Potential duplicate found</strong>
              <p>You can still save this application.</p>
              <ul>
                {duplicates.map((duplicate) => (
                  <li key={duplicate.id}>
                    {duplicate.job_title} at {duplicate.company} —{' '}
                    {APPLICATION_STATUS_LABELS[duplicate.status]} ·{' '}
                    {duplicate.archived_at ? 'Archived' : 'Active'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="application-dialog__grid">
          <label className="application-dialog__field">
            <span>Job location</span>
            <input value={location} onChange={(event) => setLocation(event.target.value)} />
            {fieldErrors.location && <small role="alert">{fieldErrors.location}</small>}
          </label>

          <label className="application-dialog__field">
            <span>Application date</span>
            <input
              type="date"
              value={appliedDate}
              onChange={(event) => setAppliedDate(event.target.value)}
            />
            {fieldErrors.applied_date && <small role="alert">{fieldErrors.applied_date}</small>}
          </label>

          <label className="application-dialog__field">
            <span>Application status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as ApplicationStatus)}
            >
              {APPLICATION_STATUSES.map((option) => (
                <option value={option.value} key={option.value}>{option.label}</option>
              ))}
            </select>
            {fieldErrors.status && <small role="alert">{fieldErrors.status}</small>}
          </label>

          <label className="application-dialog__field">
            <span>Work arrangement</span>
            <select
              value={workArrangement}
              onChange={(event) => setWorkArrangement(event.target.value as WorkArrangement)}
            >
              <option value="">Not specified</option>
              {WORK_ARRANGEMENTS.map((option) => (
                <option value={option.value} key={option.value}>{option.label}</option>
              ))}
            </select>
            {fieldErrors.work_arrangement && <small role="alert">{fieldErrors.work_arrangement}</small>}
          </label>

          <label className="application-dialog__field">
            <span>Employment type</span>
            <select
              value={employmentType}
              onChange={(event) => setEmploymentType(event.target.value as EmploymentType)}
            >
              <option value="">Not specified</option>
              {EMPLOYMENT_TYPES.map((option) => (
                <option value={option.value} key={option.value}>{option.label}</option>
              ))}
            </select>
            {fieldErrors.employment_type && <small role="alert">{fieldErrors.employment_type}</small>}
          </label>

          <label className="application-dialog__field application-dialog__field--wide">
            <span>External job posting URL</span>
            <input
              type="url"
              value={externalJobUrl}
              onChange={(event) => setExternalJobUrl(event.target.value)}
              placeholder="https://…"
            />
            {fieldErrors.external_job_url && <small role="alert">{fieldErrors.external_job_url}</small>}
          </label>
        </div>

        <label className="application-dialog__field">
          <span>Personal notes</span>
          <textarea
            rows={5}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Add application notes…"
          />
          {fieldErrors.notes && <small role="alert">{fieldErrors.notes}</small>}
        </label>

        {formError && <p className="application-dialog__error" role="alert">{formError}</p>}

        <div className="application-dialog__actions">
          <button
            type="button"
            className="application-dialog__secondary"
            disabled={submitting}
            onClick={closeDialog}
          >
            Cancel
          </button>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save application'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default ApplicationCreateDialog;
