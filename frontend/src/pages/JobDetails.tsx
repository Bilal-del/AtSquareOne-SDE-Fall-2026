import { isAxiosError } from 'axios';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getJobById, type Job } from '../api/jobs';
import SaveJobButton from '../components/SaveJobButton';
import './JobDetails.css';

type JobDetailsStatus = 'loading' | 'ready' | 'not-found' | 'error';

function formatAddedDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function JobDetails() {
  const { id } = useParams();
  const [job, setJob] = useState<Job | null>(null);
  const [status, setStatus] = useState<JobDetailsStatus>('loading');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function fetchJob() {
      setJob(null);
      setStatus('loading');
      const jobId = Number(id);

      if (!id || !Number.isInteger(jobId) || jobId <= 0) {
        if (active) {
          setJob(null);
          setStatus('not-found');
        }
        return;
      }

      try {
        const data = await getJobById(jobId);
        if (active) {
          setJob(data);
          setStatus('ready');
        }
      } catch (error) {
        if (active) {
          const notFound = isAxiosError(error) && error.response?.status === 404;
          setJob(null);
          setStatus(notFound ? 'not-found' : 'error');
          if (!notFound) {
            console.error(error);
          }
        }
      }
    }

    fetchJob();

    return () => {
      active = false;
    };
  }, [id, retryKey]);

  function retryLoadingJob() {
    setJob(null);
    setStatus('loading');
    setRetryKey((value) => value + 1);
  }

  return (
    <section className="job-details-page">
      <div className="job-details-heading">
        <div>
          <h1>Find your fit. Take the next step.</h1>
          <p>Review this fictional demo role and its available details.</p>
        </div>
        <span className="job-details-demo-badge">Demo · Database data</span>
      </div>

      <Link className="job-details-back-link" to="/jobs">
        <span aria-hidden="true">←</span> Back to search results
      </Link>

      {status === 'loading' && (
        <div className="job-details-state" role="status">
          <span className="job-details-state__badge">Loading</span>
          <h2>Retrieving job details…</h2>
          <p>Loading this fictional record from the SquareOne database.</p>
        </div>
      )}

      {status === 'error' && (
        <div className="job-details-state job-details-state--error" role="alert">
          <span className="job-details-state__badge">Unable to load</span>
          <h2>We couldn’t retrieve this job.</h2>
          <p>Check that the Django API is available, then try again.</p>
          <button type="button" onClick={retryLoadingJob}>Retry</button>
        </div>
      )}

      {status === 'not-found' && (
        <div className="job-details-state">
          <span className="job-details-state__badge">Not found</span>
          <h2>This job could not be found.</h2>
          <p>It may have been removed, or the job URL may be incorrect.</p>
          <Link className="button-link" to="/jobs">Browse demo jobs</Link>
        </div>
      )}

      {status === 'ready' && job && (
        <div className="job-details-layout">
          <div className="job-details-primary">
            <article className="job-details-card job-details-summary">
              <span className="job-details-label">Demo listing</span>
              <h2>{job.title}</h2>
              <p className="job-details-summary__company">
                {job.company} <span aria-hidden="true">·</span> {job.location}
              </p>
              <p className="job-details-summary__date">
                Added to SquareOne on {formatAddedDate(job.created_at)}
              </p>
            </article>

            <article className="job-details-card job-details-description">
              <h2>About the role</h2>
              <p>{job.description}</p>
            </article>
          </div>

          <aside className="job-details-sidebar" aria-label="Job record information">
            <section className="job-details-card job-details-next-step">
              <h2>Ready to take the next step?</h2>
              <p>
                This demo record does not include an external application link. You can still
                save it to SquareOne and manage its status, date, and notes in the tracker.
              </p>
              <SaveJobButton jobId={job.id} />
            </section>

            <section className="job-details-card job-details-record">
              <h2>About this listing</h2>
              <dl>
                <div>
                  <dt>Data source</dt>
                  <dd>SquareOne demo database</dd>
                </div>
                <div>
                  <dt>Record type</dt>
                  <dd>Fictional internship project data</dd>
                </div>
                <div>
                  <dt>Date added</dt>
                  <dd>{formatAddedDate(job.created_at)}</dd>
                </div>
              </dl>
            </section>

            <section className="job-details-card job-details-planned">
              <span className="job-details-label">SquareOne workflow</span>
              <h2>Manage every next step</h2>
              <p>
                Open the application tracker to update this opportunity or remove it when it is
                no longer relevant. External application links remain a future enhancement.
              </p>
            </section>
          </aside>
        </div>
      )}
    </section>
  );
}

export default JobDetails;
