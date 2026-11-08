import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { getAllJobs, type Job } from '../api/jobs';
import JobListingCard from '../components/JobListingCard';
import './JobSearch.css';

function JobSearch() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');
  const [appliedKeyword, setAppliedKeyword] = useState('');
  const [appliedLocation, setAppliedLocation] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function fetchJobs() {
      try {
        const data = await getAllJobs();
        if (active) {
          setJobs(data);
        }
      } catch (err) {
        if (active) {
          setError('Failed to load jobs.');
          console.error(err);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    fetchJobs();

    return () => {
      active = false;
    };
  }, [retryKey]);

  const filteredJobs = useMemo(() => {
    const normalizedKeyword = appliedKeyword.toLocaleLowerCase();
    const normalizedLocation = appliedLocation.toLocaleLowerCase();

    return jobs.filter((job) => {
      const searchableJobText = `${job.title} ${job.company} ${job.description}`.toLocaleLowerCase();
      const searchableLocation = job.location.toLocaleLowerCase();

      return (
        searchableJobText.includes(normalizedKeyword)
        && searchableLocation.includes(normalizedLocation)
      );
    });
  }, [appliedKeyword, appliedLocation, jobs]);

  const hasActiveFilters = Boolean(appliedKeyword || appliedLocation);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedKeyword(keyword.trim());
    setAppliedLocation(location.trim());
  }

  function clearSearch() {
    setKeyword('');
    setLocation('');
    setAppliedKeyword('');
    setAppliedLocation('');
  }

  function retryLoadingJobs() {
    setLoading(true);
    setError(null);
    setRetryKey((value) => value + 1);
  }

  return (
    <section className="job-search-page">
      <div className="job-search-heading">
        <div>
          <h1>Your next step starts here.</h1>
          <p>Explore demo opportunities, all in one place.</p>
        </div>
        <span className="demo-data-badge">Demo · Database data</span>
      </div>

      <form className="job-search-form" onSubmit={handleSearch}>
        <label className="job-search-field">
          <span>Job title or keyword</span>
          <input
            type="search"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="Software engineer, cybersecurity, data…"
          />
        </label>

        <label className="job-search-field">
          <span>Location</span>
          <input
            type="search"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Chicago, IL or remote"
          />
        </label>

        <div className="job-search-actions">
          <button type="submit">Search jobs</button>
          {hasActiveFilters && (
            <button className="button-secondary" type="button" onClick={clearSearch}>
              Clear
            </button>
          )}
        </div>
      </form>

      <div className="job-search-layout">
        <aside className="planned-filters" aria-labelledby="planned-filters-title">
          <span className="planned-filters__badge">Planned</span>
          <h2 id="planned-filters-title">Discovery filters</h2>
          <p>
            Work arrangement, experience level, source platform, and date-posted filters
            will appear here when the backend supports them.
          </p>
        </aside>

        <div className="job-results" aria-live="polite">
          {!loading && !error && (
            <div className="job-results__toolbar">
              <h2>
                {filteredJobs.length} {filteredJobs.length === 1 ? 'opportunity' : 'opportunities'}
              </h2>
              {hasActiveFilters && (
                <span>Filtered from {jobs.length} demo {jobs.length === 1 ? 'record' : 'records'}</span>
              )}
            </div>
          )}

          {loading && (
            <div className="job-results-state" role="status">
              <h2>Loading opportunities…</h2>
              <p>Retrieving demo job records from SquareOne.</p>
            </div>
          )}

          {error && (
            <div className="job-results-state job-results-state--error" role="alert">
              <h2>We couldn’t load the jobs.</h2>
              <p>{error} Check that the Django API is available, then try again.</p>
              <button type="button" onClick={retryLoadingJobs}>
                Retry
              </button>
            </div>
          )}

          {!loading && !error && jobs.length === 0 && (
            <div className="job-results-state">
              <h2>No opportunities are available yet.</h2>
              <p>Demo jobs added to the SquareOne database will appear here.</p>
            </div>
          )}

          {!loading && !error && jobs.length > 0 && filteredJobs.length === 0 && (
            <div className="job-results-state">
              <h2>No jobs match your search.</h2>
              <p>Try a broader keyword or location.</p>
              <button type="button" onClick={clearSearch}>Clear search</button>
            </div>
          )}

          {!loading && !error && filteredJobs.map((job) => (
            <JobListingCard job={job} key={job.id} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default JobSearch;
