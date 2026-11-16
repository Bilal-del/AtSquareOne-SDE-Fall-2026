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
  type ApplicationStatus,
  type UpdateApplicationInput,
} from '../api/applications';

const STATUS_OPTIONS: Array<{ value: ApplicationStatus; label: string }> = [
  { value: 'saved', label: 'Saved' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offered', label: 'Offered' },
  { value: 'rejected', label: 'Rejected' },
];

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
  const [status, setStatus] = useState<ApplicationStatus>(application.status);
  const [appliedDate, setAppliedDate] = useState(application.applied_date ?? '');
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
    if (status !== application.status) changes.status = status;
    if ((appliedDate || null) !== application.applied_date) {
      changes.applied_date = appliedDate || null;
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
      className="application-dialog"
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

          <label className="application-dialog__field">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as ApplicationStatus)}>
              {STATUS_OPTIONS.map((option) => (
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
            <small>
              Optional. Enter or clear this date explicitly; changing status will not change it.
            </small>
            {status === 'applied' && !appliedDate && (
              <small className="application-dialog__notice">
                This application is marked Applied without a recorded application date.
              </small>
            )}
            {fieldErrors.applied_date && <small role="alert">{fieldErrors.applied_date}</small>}
          </label>

          <label className="application-dialog__field">
            <span>Notes</span>
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
