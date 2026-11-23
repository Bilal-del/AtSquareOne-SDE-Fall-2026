import { isAxiosError } from 'axios';
import { useEffect, useRef, useState } from 'react';
import {
  archiveApplication,
  getApplicationReminders,
  restoreApplication,
  type Application,
  type ApplicationReminder,
} from '../api/applications';

interface ApplicationArchiveDialogProps {
  application: Application;
  onClose: () => void;
  onUpdated: (application: Application) => void;
}

function ApplicationArchiveDialog({
  application,
  onClose,
  onUpdated,
}: ApplicationArchiveDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const submissionPending = useRef(false);
  const restoring = Boolean(application.archived_at);
  const [reminders, setReminders] = useState<ApplicationReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [choice, setChoice] = useState<'continue' | 'pause' | 'enable' | 'disable'>(
    restoring ? 'enable' : 'continue',
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    getApplicationReminders(application.id)
      .then((data) => {
        if (active) setReminders(data);
      })
      .catch((error) => {
        if (active) {
          setLoadError(
            'Reminders could not be loaded. Try again before changing the archive state.',
          );
          console.error(error);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [application.id, reloadKey]);

  function closeDialog() {
    if (!submitting) {
      dialogRef.current?.close();
      onClose();
    }
  }

  async function submitArchiveChange() {
    if (submissionPending.current || loading || loadError) return;
    submissionPending.current = true;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const updated = restoring
        ? await restoreApplication(
            application.id,
            choice === 'disable' ? 'disable' : 'enable',
          )
        : await archiveApplication(
            application.id,
            choice === 'pause' ? 'pause' : 'continue',
          );
      dialogRef.current?.close();
      onUpdated(updated);
    } catch (error) {
      if (isAxiosError(error) && !error.response) {
        setSubmitError('The SquareOne API could not be reached. No changes were made.');
      } else {
        setSubmitError(
          `The application could not be ${restoring ? 'restored' : 'archived'}. Try again.`,
        );
      }
      console.error(error);
    } finally {
      submissionPending.current = false;
      setSubmitting(false);
    }
  }

  return (
    <dialog
      className="application-dialog"
      ref={dialogRef}
      aria-labelledby="archive-application-title"
      onCancel={(event) => {
        if (submitting) event.preventDefault();
        else onClose();
      }}
      onClose={() => {
        if (!submitting) onClose();
      }}
    >
      <div>
        <span className="application-dialog__eyebrow">
          {restoring ? 'Restore application' : 'Archive application'}
        </span>
        <h2 id="archive-application-title">
          {restoring ? 'Restore' : 'Archive'} {application.job_title}?
        </h2>
        <p>
          Its status, notes, activity, reminders, and job information will be preserved.
        </p>

        {loading && <p role="status">Checking reminders…</p>}
        {loadError && (
          <div className="application-dialog__error" role="alert">
            <p>{loadError}</p>
            <button type="button" onClick={() => setReloadKey((value) => value + 1)}>
              Retry
            </button>
          </div>
        )}

        {!loading && !loadError && reminders.length === 0 && (
          <p>This application has no reminders.</p>
        )}

        {!loading && !loadError && reminders.length > 0 && (
          <fieldset className="application-archive-choices">
            <legend>What should happen to its {reminders.length} reminder{reminders.length === 1 ? '' : 's'}?</legend>
            {restoring ? (
              <>
                <label>
                  <input
                    type="radio"
                    name="restore-reminders"
                    value="enable"
                    checked={choice === 'enable'}
                    onChange={() => setChoice('enable')}
                  />
                  <span><strong>Enable reminders</strong> — turn all reminders on.</span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="restore-reminders"
                    value="disable"
                    checked={choice === 'disable'}
                    onChange={() => setChoice('disable')}
                  />
                  <span><strong>Disable reminders</strong> — keep all reminders off.</span>
                </label>
              </>
            ) : (
              <>
                <label>
                  <input
                    type="radio"
                    name="archive-reminders"
                    value="continue"
                    checked={choice === 'continue'}
                    onChange={() => setChoice('continue')}
                  />
                  <span><strong>Continue reminders</strong> — preserve each reminder’s current setting.</span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="archive-reminders"
                    value="pause"
                    checked={choice === 'pause'}
                    onChange={() => setChoice('pause')}
                  />
                  <span><strong>Pause reminders</strong> — disable all reminders.</span>
                </label>
              </>
            )}
          </fieldset>
        )}

        {submitError && <p className="application-dialog__error" role="alert">{submitError}</p>}

        <div className="application-dialog__actions">
          <button
            type="button"
            className="application-dialog__secondary"
            disabled={submitting}
            onClick={closeDialog}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || loading || Boolean(loadError)}
            onClick={submitArchiveChange}
          >
            {submitting
              ? restoring ? 'Restoring…' : 'Archiving…'
              : restoring ? 'Restore application' : 'Archive application'}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default ApplicationArchiveDialog;
