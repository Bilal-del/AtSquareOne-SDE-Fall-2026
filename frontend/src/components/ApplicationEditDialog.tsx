import { isAxiosError } from 'axios';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  updateApplication,
  type Application,
  type UpdateApplicationInput,
} from '../api/applications';
import {
  EMPLOYMENT_TYPES,
  WORK_ARRANGEMENTS,
  type EmploymentType,
  type WorkArrangement,
} from '../constants/applicationFields';
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from '../constants/applicationStatuses';

interface ApplicationEditDialogProps {
  application: Application;
  onClose: () => void;
  onMissing: (id: number) => void;
  onUpdated: (application: Application) => void;
}

function ApplicationEditDialog({
  application,
  onClose,
  onMissing,
  onUpdated,
}: ApplicationEditDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const submittingRef = useRef(false);
  const [jobTitle, setJobTitle] = useState(application.job_title);
  const [company, setCompany] = useState(application.company);
  const [location, setLocation] = useState(application.location);
  const [status, setStatus] = useState<ApplicationStatus>(application.status);
  const [appliedDate, setAppliedDate] = useState(application.applied_date ?? '');
  const [externalJobUrl, setExternalJobUrl] = useState(
    application.external_job_url,
  );
  const [workArrangement, setWorkArrangement] = useState<WorkArrangement>(
    application.work_arrangement,
  );
  const [employmentType, setEmploymentType] = useState<EmploymentType>(
    application.employment_type,
  );
  const [notes, setNotes] = useState(application.notes);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function closeDialog() {
    if (!submitting) {
      dialogRef.current?.close();
      onClose();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) {
      return;
    }

    const changes: UpdateApplicationInput = {};
    if (application.source === 'manual') {
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
      if (trimmedTitle !== application.job_title) {
        changes.job_title = trimmedTitle;
      }
      if (trimmedCompany !== application.company) {
        changes.company = trimmedCompany;
      }
    }
    if (location.trim() !== application.location) {
      changes.location = location.trim();
    }
    if (status !== application.status) changes.status = status;
    if ((appliedDate || null) !== application.applied_date) {
      changes.applied_date = appliedDate || null;
    }
    if (externalJobUrl.trim() !== application.external_job_url) {
      changes.external_job_url = externalJobUrl.trim();
    }
    if (workArrangement !== application.work_arrangement) {
      changes.work_arrangement = workArrangement;
    }
    if (employmentType !== application.employment_type) {
      changes.employment_type = employmentType;
    }
    if (notes !== application.notes) changes.notes = notes;

    if (Object.keys(changes).length === 0) {
      setFormError('Make a change before saving.');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const updatedApplication = await updateApplication(application.id, changes);
      dialogRef.current?.close();
      onUpdated(updatedApplication);
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) {
        dialogRef.current?.close();
        onMissing(application.id);
      } else if (isAxiosError(error) && error.response?.status === 400) {
        const responseData = error.response.data;
        const errors: Record<string, string> = {};
        if (responseData && typeof responseData === 'object') {
          Object.entries(responseData as Record<string, unknown>).forEach(([field, value]) => {
            errors[field] = Array.isArray(value) ? value.join(' ') : String(value);
          });
        }
        setFieldErrors(errors);
        setFormError('Review the highlighted fields and try again.');
      } else if (isAxiosError(error) && !error.response) {
        setFormError('The SquareOne API could not be reached. Check your connection and try again.');
      } else if (
        isAxiosError(error) &&
        (error.response?.status === 401 || error.response?.status === 403)
      ) {
        setFormError('You are not authorized to update this application.');
      } else {
        setFormError('The application could not be updated. Please try again.');
      }
      console.error(error);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <dialog
      className="application-dialog application-dialog--wide"
      ref={dialogRef}
      aria-labelledby="edit-application-title"
      onCancel={(event) => {
        if (submitting) event.preventDefault();
        else onClose();
      }}
      onClose={() => {
        if (application && !submitting) onClose();
      }}
    >
        <form method="dialog" onSubmit={handleSubmit}>
          <div className="application-dialog__heading">
            <div>
              <span className="application-dialog__eyebrow">Edit application</span>
              <h2 id="edit-application-title">{application.job_title}</h2>
              <p>{application.company}</p>
              {application.source === 'squareone' && (
                <small>Job title and company are managed by the linked SquareOne job.</small>
              )}
            </div>
            <button
              className="application-dialog__close"
              type="button"
              aria-label="Close edit application dialog"
              disabled={submitting}
              onClick={closeDialog}
            >
              ×
            </button>
          </div>

          {application.source === 'manual' && (
            <div className="application-dialog__grid">
              <label className="application-dialog__field">
                <span>Job title *</span>
                <input value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} />
                {fieldErrors.job_title && <small role="alert">{fieldErrors.job_title}</small>}
              </label>
              <label className="application-dialog__field">
                <span>Company name *</span>
                <input value={company} onChange={(event) => setCompany(event.target.value)} />
                {fieldErrors.company && <small role="alert">{fieldErrors.company}</small>}
              </label>
            </div>
          )}

          <div className="application-dialog__grid">
            <label className="application-dialog__field">
              <span>Job location</span>
              <input value={location} onChange={(event) => setLocation(event.target.value)} />
              {fieldErrors.location && <small role="alert">{fieldErrors.location}</small>}
            </label>

            <label className="application-dialog__field">
              <span>Status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as ApplicationStatus)}>
                {APPLICATION_STATUSES.map((option) => (
                  <option value={option.value} key={option.value}>{option.label}</option>
                ))}
              </select>
              {fieldErrors.status && <small role="alert">{fieldErrors.status}</small>}
            </label>

            <label className="application-dialog__field">
              <span>Applied date</span>
              <input
                type="date"
                value={appliedDate}
                onChange={(event) => setAppliedDate(event.target.value)}
              />
              <small>Changing status will not change this optional date.</small>
              {status === 'applied' && !appliedDate && (
                <small className="application-dialog__notice">
                  This application is marked Applied without a recorded application date.
                </small>
              )}
              {fieldErrors.applied_date && <small role="alert">{fieldErrors.applied_date}</small>}
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
            <button type="button" className="application-dialog__secondary" disabled={submitting} onClick={closeDialog}>
              Cancel
            </button>
            <button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
    </dialog>
  );
}

export default ApplicationEditDialog;
