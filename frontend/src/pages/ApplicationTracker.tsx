import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
    getAllApplications,
    type Application,
    type ApplicationStatus,
} from '../api/applications';
import ApplicationDeleteDialog from '../components/ApplicationDeleteDialog';
import ApplicationEditDialog from '../components/ApplicationEditDialog';
import './ApplicationTracker.css';

const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
    saved: 'Saved',
    applied: 'Applied',
    interviewing: 'Interviewing',
    offered: 'Offered',
    rejected: 'Rejected',
};

const OVERVIEW_STATUSES: Array<{
    status: Exclude<ApplicationStatus, 'rejected'>;
    label: string;
}> = [
    { status: 'saved', label: 'Saved' },
    { status: 'applied', label: 'Applied' },
    { status: 'interviewing', label: 'Interviewing' },
    { status: 'offered', label: 'Offers' },
];

const APPLICATIONS_PER_PAGE = 5;

function formatDate(value: string | null): string {
    if (!value) {
        return 'Not yet applied';
    }

    const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T00:00:00`)
        : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return 'Date unavailable';
    }

    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    }).format(date);
}

function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
    return (
        <span className={`application-status application-status--${status}`}>
            {APPLICATION_STATUS_LABELS[status]}
        </span>
    );
}

function ApplicationTracker() {
    const [applications, setApplications] = useState<Application[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchInput, setSearchInput] = useState('');
    const [appliedSearch, setAppliedSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | ApplicationStatus>(
        'all',
    );
    const [currentPage, setCurrentPage] = useState(1);
    const [retryKey, setRetryKey] = useState(0);
    const [editingApplication, setEditingApplication] = useState<Application | null>(null);
    const [deletingApplication, setDeletingApplication] = useState<Application | null>(null);
    const [operationMessage, setOperationMessage] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        async function fetchApplications() {
            try {
                const data = await getAllApplications();

                if (active) {
                    setApplications(data);
                }
            } catch (err) {
                if (active) {
                    setError('Failed to load applications.');
                    console.error(err);
                }
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        }

        fetchApplications();

        return () => {
            active = false;
        };
    }, [retryKey]);

    const statusCounts = useMemo(() => {
        const counts: Record<ApplicationStatus, number> = {
            saved: 0,
            applied: 0,
            interviewing: 0,
            offered: 0,
            rejected: 0,
        };

        applications.forEach((application) => {
            counts[application.status] += 1;
        });

        return counts;
    }, [applications]);

    const filteredApplications = useMemo(() => {
        const normalizedSearch = appliedSearch.toLocaleLowerCase();

        return applications.filter((application) => {
            const searchableText = `${application.job_title} ${application.company}`
                .toLocaleLowerCase();
            const matchesSearch = searchableText.includes(normalizedSearch);
            const matchesStatus =
                statusFilter === 'all' || application.status === statusFilter;

            return matchesSearch && matchesStatus;
        });
    }, [applications, appliedSearch, statusFilter]);

    const totalPages = Math.ceil(
        filteredApplications.length / APPLICATIONS_PER_PAGE,
    );
    const activePage = Math.min(currentPage, Math.max(1, totalPages));
    const visibleApplications = filteredApplications.slice(
        (activePage - 1) * APPLICATIONS_PER_PAGE,
        activePage * APPLICATIONS_PER_PAGE,
    );
    const visiblePageNumbers = Array.from(
        { length: Math.min(totalPages, 5) },
        (_, index) => {
            const firstVisiblePage = Math.max(
                1,
                Math.min(activePage - 2, totalPages - 4),
            );
            return firstVisiblePage + index;
        },
    );
    const hasActiveFilters = Boolean(appliedSearch || statusFilter !== 'all');

    function handleSearch(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setAppliedSearch(searchInput.trim());
        setCurrentPage(1);
    }

    function clearFilters() {
        setSearchInput('');
        setAppliedSearch('');
        setStatusFilter('all');
        setCurrentPage(1);
    }

    function retryLoadingApplications() {
        setLoading(true);
        setError(null);
        setRetryKey((value) => value + 1);
    }

    function handleApplicationUpdated(updatedApplication: Application) {
        setApplications((currentApplications) =>
            currentApplications.map((application) =>
                application.id === updatedApplication.id ? updatedApplication : application,
            ),
        );
        setEditingApplication(null);
        setOperationMessage(`${updatedApplication.job_title} was updated successfully.`);
    }

    function handleApplicationMissing(id: number) {
        setApplications((currentApplications) =>
            currentApplications.filter((application) => application.id !== id),
        );
        setEditingApplication(null);
        setOperationMessage('That application no longer exists. The tracker has been refreshed.');
    }

    function handleApplicationDeleted(id: number, alreadyMissing: boolean) {
        const removedApplication = applications.find((application) => application.id === id);
        setApplications((currentApplications) =>
            currentApplications.filter((application) => application.id !== id),
        );
        setDeletingApplication(null);
        setOperationMessage(
            alreadyMissing
                ? 'That application was already removed. The tracker has been refreshed.'
                : `${removedApplication?.job_title ?? 'The application'} was removed successfully.`,
        );
    }

    return (
        <section className="application-tracker-page">
            <p className="application-tracker-sr-only" role="status" aria-live="polite">
                {operationMessage}
            </p>
            <div className="application-tracker-heading">
                <div>
                    <h1>Keep your next move in sight.</h1>
                    <p>Track every demo opportunity from saved job to offer.</p>
                </div>
                <span className="application-tracker-demo-badge">
                    Demo · Database data
                </span>
            </div>

            {loading && (
                <div className="application-tracker-state" role="status">
                    <span className="application-tracker-state__badge">Loading</span>
                    <h2>Retrieving tracked applications…</h2>
                    <p>Loading all fictional application records from SquareOne.</p>
                </div>
            )}

            {error && (
                <div
                    className="application-tracker-state application-tracker-state--error"
                    role="alert"
                >
                    <span className="application-tracker-state__badge">
                        Unable to load
                    </span>
                    <h2>We couldn’t retrieve your application tracker.</h2>
                    <p>
                        {error} Check that the Django API is available, then try
                        again.
                    </p>
                    <button type="button" onClick={retryLoadingApplications}>
                        Retry
                    </button>
                </div>
            )}

            {!loading && !error && applications.length === 0 && (
                <div className="application-tracker-state">
                    <span className="application-tracker-state__badge">No records</span>
                    <h2>No applications are being tracked yet.</h2>
                    <p>
                        Fictional application records added to SquareOne will appear
                        here.
                    </p>
                </div>
            )}

            {!loading && !error && applications.length > 0 && (
                <>
                    <div
                        className="application-overview"
                        aria-label="Application overview"
                    >
                        {OVERVIEW_STATUSES.map(({ status, label }) => (
                            <article className="application-overview__card" key={status}>
                                <strong>{statusCounts[status]}</strong>
                                <span>{label}</span>
                            </article>
                        ))}
                    </div>

                    <div className="application-tracker-toolbar">
                        <div className="application-tracker-toolbar__summary">
                            <h2>All opportunities ({applications.length})</h2>
                            {hasActiveFilters && (
                                <span>
                                    {filteredApplications.length}{' '}
                                    {filteredApplications.length === 1
                                        ? 'match'
                                        : 'matches'}
                                </span>
                            )}
                        </div>

                        <form
                            className="application-tracker-search"
                            onSubmit={handleSearch}
                        >
                            <label>
                                <span className="application-tracker-sr-only">
                                    Search company or role
                                </span>
                                <input
                                    type="search"
                                    value={searchInput}
                                    onChange={(event) =>
                                        setSearchInput(event.target.value)
                                    }
                                    placeholder="Search company or role…"
                                />
                            </label>
                            <button type="submit">Search</button>
                        </form>

                        <label className="application-tracker-filter">
                            <span className="application-tracker-sr-only">
                                Filter by application status
                            </span>
                            <select
                                value={statusFilter}
                                onChange={(event) => {
                                    setStatusFilter(
                                        event.target.value as 'all' | ApplicationStatus,
                                    );
                                    setCurrentPage(1);
                                }}
                            >
                                <option value="all">All statuses</option>
                                {Object.entries(APPLICATION_STATUS_LABELS).map(
                                    ([status, label]) => (
                                        <option value={status} key={status}>
                                            {label}
                                        </option>
                                    ),
                                )}
                            </select>
                        </label>

                        {hasActiveFilters && (
                            <button
                                className="application-tracker-clear"
                                type="button"
                                onClick={clearFilters}
                            >
                                Clear
                            </button>
                        )}

                        <div
                            className="application-tracker-planned-action"
                            aria-label="Add application controls are planned"
                        >
                            <span>Planned</span>
                            Add application
                        </div>
                    </div>

                    {filteredApplications.length === 0 ? (
                        <div className="application-tracker-state">
                            <span className="application-tracker-state__badge">
                                No matches
                            </span>
                            <h2>No applications match these filters.</h2>
                            <p>Try another company, role, or status.</p>
                            <button type="button" onClick={clearFilters}>
                                Clear filters
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="application-table-wrap">
                                <table className="application-table">
                                    <caption className="application-tracker-sr-only">
                                        Tracked application records
                                    </caption>
                                    <thead>
                                        <tr>
                                            <th scope="col">Role / Company</th>
                                            <th scope="col">Status</th>
                                            <th scope="col">Date added</th>
                                            <th scope="col">Applied on</th>
                                            <th scope="col">Notes</th>
                                            <th scope="col">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visibleApplications.map((application) => (
                                            <tr key={application.id}>
                                                <td data-label="Role / Company">
                                                    <strong>
                                                        {application.job_title ||
                                                            'Job title unavailable'}
                                                    </strong>
                                                    <span>
                                                        {application.company ||
                                                            'Company unavailable'}
                                                    </span>
                                                </td>
                                                <td data-label="Status">
                                                    <ApplicationStatusBadge
                                                        status={application.status}
                                                    />
                                                </td>
                                                <td data-label="Date added">
                                                    {formatDate(application.created_at)}
                                                </td>
                                                <td data-label="Applied on">
                                                    {formatDate(application.applied_date)}
                                                </td>
                                                <td data-label="Notes">
                                                    {application.notes || 'No notes added.'}
                                                </td>
                                                <td data-label="Action">
                                                    <div className="application-table__actions">
                                                        {application.job ? (
                                                            <Link to={`/jobs/${application.job}`}>
                                                                View job
                                                            </Link>
                                                        ) : (
                                                            <span className="application-table__unavailable">
                                                                Job unavailable
                                                            </span>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setOperationMessage(null);
                                                                setEditingApplication(application);
                                                            }}
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            className="application-table__remove"
                                                            type="button"
                                                            onClick={() => {
                                                                setOperationMessage(null);
                                                                setDeletingApplication(application);
                                                            }}
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <nav
                                className="application-pagination"
                                aria-label="Application table pagination"
                            >
                                <span>
                                    Showing{' '}
                                    {(activePage - 1) * APPLICATIONS_PER_PAGE + 1}–
                                    {Math.min(
                                        activePage * APPLICATIONS_PER_PAGE,
                                        filteredApplications.length,
                                    )}{' '}
                                    of {filteredApplications.length}
                                </span>
                                <div className="application-pagination__controls">
                                    <button
                                        type="button"
                                        disabled={activePage === 1}
                                        onClick={() =>
                                            setCurrentPage(activePage - 1)
                                        }
                                    >
                                        ‹ Previous
                                    </button>
                                    {visiblePageNumbers.map((pageNumber) => (
                                        <button
                                            className={
                                                pageNumber === activePage
                                                    ? 'application-pagination__page application-pagination__page--active'
                                                    : 'application-pagination__page'
                                            }
                                            type="button"
                                            aria-current={
                                                pageNumber === activePage
                                                    ? 'page'
                                                    : undefined
                                            }
                                            onClick={() => setCurrentPage(pageNumber)}
                                            key={pageNumber}
                                        >
                                            {pageNumber}
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        disabled={activePage === totalPages}
                                        onClick={() =>
                                            setCurrentPage(activePage + 1)
                                        }
                                    >
                                        Next ›
                                    </button>
                                </div>
                            </nav>
                        </>
                    )}

                    <aside className="application-tracker-planned-note">
                        <strong>Planned</strong>
                        <span>
                            Reminders and next-step deadlines require future
                            application data and are not active in this demo.
                        </span>
                    </aside>
                </>
            )}

            {editingApplication && (
                <ApplicationEditDialog
                    application={editingApplication}
                    onClose={() => setEditingApplication(null)}
                    onMissing={handleApplicationMissing}
                    onUpdated={handleApplicationUpdated}
                />
            )}
            {deletingApplication && (
                <ApplicationDeleteDialog
                    application={deletingApplication}
                    onClose={() => setDeletingApplication(null)}
                    onDeleted={handleApplicationDeleted}
                />
            )}
        </section>
    );
}

export default ApplicationTracker;
