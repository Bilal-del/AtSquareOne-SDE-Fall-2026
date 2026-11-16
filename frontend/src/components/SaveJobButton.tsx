import { isAxiosError } from 'axios';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  createApplication,
  getAllApplications,
  type Application,
  type ApplicationStatus,
} from '../api/applications';

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: 'Saved',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offered: 'Offered',
  rejected: 'Rejected',
};

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
  const [trackedApplication, setTrackedApplication] = useState<Application | null>(null);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const submissionPending = useRef(false);

  useEffect(() => {
    let active = true;

    async function checkTracker() {
      try {
        const applications = await getAllApplications();
        if (active) {
          setTrackedApplication(
            applications.find((application) => application.job === jobId) ?? null,
          );
        }
      } catch (error) {
        if (active) {
          setMessage('Unable to check the application tracker right now. Try again before saving.');
        }
        console.error(error);
      } finally {
        if (active) {
          setChecking(false);
        }
      }
    }

    checkTracker();
    return () => {
      active = false;
    };
  }, [jobId]);

  async function saveJob() {
    if (submissionPending.current || trackedApplication) {
      return;
    }

    submissionPending.current = true;
    setSaving(true);
    setMessage(null);

    try {
      const applications = await getAllApplications();
      const existingApplication = applications.find(
        (application) => application.job === jobId,
      );

      if (existingApplication) {
        setTrackedApplication(existingApplication);
        setMessage('This job is already in your application tracker.');
        return;
      }

      const createdApplication = await createApplication({
        job: jobId,
        status: 'saved',
      });
      setTrackedApplication(createdApplication);
      setMessage('Job saved to your application tracker.');
    } catch (error) {
      setMessage(getSaveErrorMessage(error));
      console.error(error);
    } finally {
      submissionPending.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="save-job-control">
      {trackedApplication ? (
        <div className="save-job-control__tracked">
          <strong>Already tracked</strong>
          <span>Status: {STATUS_LABELS[trackedApplication.status]}</span>
          <Link to="/applications">View in application tracker</Link>
        </div>
      ) : (
        <button
          type="button"
          disabled={checking || saving}
          onClick={saveJob}
        >
          {checking ? 'Checking tracker…' : saving ? 'Saving…' : 'Save to tracker'}
        </button>
      )}
      {message && (
        <p className="save-job-control__message" role="status" aria-live="polite">
          {message}
        </p>
      )}
    </div>
  );
}

export default SaveJobButton;
