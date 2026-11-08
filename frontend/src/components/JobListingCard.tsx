import { Link } from 'react-router-dom';
import type { Job } from '../api/jobs';

interface JobListingCardProps {
  job: Job;
}

function formatAddedDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function JobListingCard({ job }: JobListingCardProps) {
  return (
    <article className="job-listing-card">
      <div className="job-listing-card__heading">
        <div>
          <h2>{job.title}</h2>
          <p className="job-listing-card__company">
            {job.company} <span aria-hidden="true">·</span> {job.location}
          </p>
        </div>
        <span className="job-listing-card__badge">Demo listing</span>
      </div>

      <p className="job-listing-card__description">{job.description}</p>

      <div className="job-listing-card__footer">
        <p className="job-listing-card__date">Added {formatAddedDate(job.created_at)}</p>
        <Link className="button-link" to={`/jobs/${job.id}`}>
          View details
        </Link>
      </div>
    </article>
  );
}

export default JobListingCard;
