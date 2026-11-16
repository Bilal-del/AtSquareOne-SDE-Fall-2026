import { isAxiosError } from 'axios';
import { useEffect, useRef, useState } from 'react';
import { deleteApplication, type Application } from '../api/applications';

interface ApplicationDeleteDialogProps {
  application: Application;
  onClose: () => void;
  onDeleted: (id: number, alreadyMissing: boolean) => void;
}

function ApplicationDeleteDialog({
  application,
  onClose,
  onDeleted,
}: ApplicationDeleteDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const submissionPending = useRef(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function closeDialog() {
    if (!deleting) {
      dialogRef.current?.close();
      onClose();
    }
  }

  async function removeApplication() {
    if (submissionPending.current) return;

    submissionPending.current = true;
    setDeleting(true);
    setError(null);

    try {
      await deleteApplication(application.id);
      dialogRef.current?.close();
      onDeleted(application.id, false);
    } catch (requestError) {
      if (isAxiosError(requestError) && requestError.response?.status === 404) {
        dialogRef.current?.close();
        onDeleted(application.id, true);
      } else if (isAxiosError(requestError) && !requestError.response) {
        setError('The SquareOne API could not be reached. The application was not removed.');
      } else if (
        isAxiosError(requestError) &&
        (requestError.response?.status === 401 || requestError.response?.status === 403)
      ) {
        setError('You are not authorized to remove this application.');
      } else {
        setError('The application could not be removed. Please try again.');
      }
      console.error(requestError);
    } finally {
      submissionPending.current = false;
      setDeleting(false);
    }
  }

  return (
    <dialog
      className="application-dialog application-dialog--danger"
      ref={dialogRef}
      aria-labelledby="delete-application-title"
      onCancel={(event) => {
        if (deleting) event.preventDefault();
        else onClose();
      }}
      onClose={() => {
        if (application && !deleting) onClose();
      }}
    >
        <div>
          <span className="application-dialog__eyebrow">Remove application</span>
          <h2 id="delete-application-title">Remove {application.job_title}?</h2>
          <p>
            This permanently removes the application for <strong>{application.job_title}</strong> at{' '}
            <strong>{application.company}</strong>. Its status, applied date, and notes will be lost.
          </p>
          <p>The associated job listing will not be deleted.</p>

          {error && <p className="application-dialog__error" role="alert">{error}</p>}

          <div className="application-dialog__actions">
            <button type="button" className="application-dialog__secondary" disabled={deleting} onClick={closeDialog}>
              Cancel
            </button>
            <button type="button" className="application-dialog__danger" disabled={deleting} onClick={removeApplication}>
              {deleting ? 'Removing…' : 'Remove application'}
            </button>
          </div>
        </div>
    </dialog>
  );
}

export default ApplicationDeleteDialog;
