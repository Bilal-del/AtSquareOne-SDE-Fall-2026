import { isAxiosError } from 'axios';
import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  createApplication,
  findApplicationDuplicates,
  type Application,
  type ApplicationDuplicate,
} from '../api/applications';
import { useAuth } from '../auth/AuthState';
import {
  APPLICATION_STATUS_LABELS,
  DEFAULT_APPLICATION_STATUS,
} from '../constants/applicationStatuses';

interface SaveJobButtonProps {
  jobId: number;
}

function getSaveErrorMessage(error: unknown): string {
  if (!isAxiosError(error)) {
    return 'Something went wrong while saving this job. Please try again.';
  }

  if (!error.response) {
    return 'The SquareOne API could not be reached. Check your connection and try again.';
  }

  if (error.response.status === 400) {
    return 'This job could not be saved because the request was not accepted. Refresh the page and try again.';
  }

  if (error.response.status === 401 || error.response.status === 403) {
    return 'You are not authorized to save this job.';
  }

  if (error.response.status === 404) {
    return 'This job is no longer available and could not be saved.';
  }

  return 'Something went wrong while saving this job. Please try again.';
}

function SaveJobButton({ jobId }: SaveJobButtonProps) {
  const { isAuthenticated, status } = useAuth();
  const location = useLocation();
  const [createdApplication, setCreatedApplication] = useState<Application | null>(null);
  const [duplicates, setDuplicates] = useState<ApplicationDuplicate[]>([]);
  const [duplicateCheckFailed, setDuplicateCheckFailed] = useState(false);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const submissionPending = useRef(false);

  async function createTrackedApplication() {
    if (submissionPending.current) return;

    submissionPending.current = true;
    setSaving(true);
    setMessage(null);

    try {
      const application = await createApplication({
        job: jobId,
        status: DEFAULT_APPLICATION_STATUS,
      });
      setCreatedApplication(application);
      setDuplicates([]);
      setDuplicateCheckFailed(false);
      setMessage('Job saved to your application tracker.');
    } catch (error) {
      setMessage(getSaveErrorMessage(error));
      console.error(error);
    } finally {
      submissionPending.current = false;
      setSaving(false);
    }
  }

  async function checkBeforeSaving() {
    if (checkingDuplicates || saving) return;

    setCheckingDuplicates(true);
    setDuplicates([]);
    setDuplicateCheckFailed(false);
    setMessage(null);
    try {
      const matches = await findApplicationDuplicates({ job: jobId });
      if (matches.length > 0) {
        setDuplicates(matches);
      } else {
        await createTrackedApplication();
      }
    } catch {
      setDuplicateCheckFailed(true);
      setMessage(
        'Duplicate check is unavailable. You can cancel or continue saving this job.',
      );
    } finally {
      setCheckingDuplicates(false);
    }
  }

  function cancelDuplicateSave() {
    setDuplicates([]);
    setDuplicateCheckFailed(false);
    setMessage('Save cancelled.');
  }

  return (
    <div className="save-job-control">
      {status === 'anonymous' ? (
        <div className="save-job-control__tracked">
          <strong>Want to track this job?</strong>
          <span>Sign in to save it to your private application tracker.</span>
          <Link
            to="/login"
            state={{ from: `${location.pathname}${location.search}` }}
          >
            Sign in to save
          </Link>
        </div>
      ) : createdApplication ? (
        <div className="save-job-control__tracked">
          <strong>Saved to your tracker</strong>
          <span>Status: {APPLICATION_STATUS_LABELS[createdApplication.status]}</span>
          <Link to="/applications">View in application tracker</Link>
        </div>
      ) : duplicates.length > 0 || duplicateCheckFailed ? (
        <div className="save-job-control__duplicate" role="status">
          <strong>
            {duplicates.length > 0
              ? 'Potential duplicate found'
              : 'Duplicate check unavailable'}
          </strong>
          {duplicates.length > 0 && (
            <ul>
              {duplicates.map((duplicate) => (
                <li key={duplicate.id}>
                  {APPLICATION_STATUS_LABELS[duplicate.status]} ·{' '}
                  {duplicate.archived_at ? 'Archived' : 'Active'}
                </li>
              ))}
            </ul>
          )}
          <span>You can cancel or save another application for this job.</span>
          <div className="save-job-control__duplicate-actions">
            <button type="button" onClick={cancelDuplicateSave}>Cancel</button>
            <button
              type="button"
              disabled={saving}
              onClick={createTrackedApplication}
            >
              {saving ? 'Saving…' : 'Continue saving'}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={status === 'initializing' || checkingDuplicates || saving}
          onClick={checkBeforeSaving}
        >
          {checkingDuplicates
            ? 'Checking tracker…'
            : saving
              ? 'Saving…'
              : 'Save to tracker'}
        </button>
      )}
      {message && isAuthenticated && (
        <p className="save-job-control__message" role="status" aria-live="polite">
          {message}
        </p>
      )}
    </div>
  );
}

export default SaveJobButton;
