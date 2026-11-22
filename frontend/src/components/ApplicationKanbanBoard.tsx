import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { Application } from '../api/applications';
import {
  EMPLOYMENT_TYPES,
  WORK_ARRANGEMENTS,
} from '../constants/applicationFields';
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from '../constants/applicationStatuses';

const DEFAULT_COLUMNS: ApplicationStatus[] = [
  'saved',
  'applied',
  'interviewing',
  'offered',
];
const COLUMN_STORAGE_KEY = 'squareone.applicationTracker.columns';
const LONG_PRESS_DELAY = 450;

interface ApplicationKanbanBoardProps {
  applications: Application[];
  onOpenApplication: (application: Application) => void;
  onStatusChange: (
    application: Application,
    status: ApplicationStatus,
  ) => Promise<void>;
}

function getInitialColumns(): ApplicationStatus[] {
  try {
    const saved = window.localStorage.getItem(COLUMN_STORAGE_KEY);
    if (!saved) return DEFAULT_COLUMNS;
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return DEFAULT_COLUMNS;
    return APPLICATION_STATUSES
      .map(({ value }) => value)
      .filter((status) => parsed.includes(status));
  } catch {
    return DEFAULT_COLUMNS;
  }
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function getOptionLabel(
  value: string,
  options: readonly { value: string; label: string }[],
): string | null {
  return options.find((option) => option.value === value)?.label ?? null;
}

function isReminderOverdue(application: Application): boolean {
  const reminder = application.next_reminder;
  if (!reminder) return false;
  const due = new Date(
    `${reminder.due_date}T${reminder.due_time?.slice(0, 5) ?? '23:59'}`,
  );
  return due.getTime() < Date.now();
}

function ApplicationKanbanBoard({
  applications,
  onOpenApplication,
  onStatusChange,
}: ApplicationKanbanBoardProps) {
  const [visibleStatuses, setVisibleStatuses] = useState<ApplicationStatus[]>(
    getInitialColumns,
  );
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [draggedApplicationId, setDraggedApplicationId] = useState<number | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<ApplicationStatus | null>(null);
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());
  const [statusError, setStatusError] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchDraggingRef = useRef<Application | null>(null);
  const touchDropStatusRef = useRef<ApplicationStatus | null>(null);
  const suppressOpenRef = useRef(false);

  useEffect(() => {
    window.localStorage.setItem(
      COLUMN_STORAGE_KEY,
      JSON.stringify(visibleStatuses),
    );
  }, [visibleStatuses]);

  useEffect(() => () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  }, []);

  async function changeStatus(
    application: Application,
    targetStatus: ApplicationStatus,
  ) {
    if (application.status === targetStatus || updatingIds.has(application.id)) return;
    setUpdatingIds((current) => new Set(current).add(application.id));
    setStatusError(null);
    try {
      await onStatusChange(application, targetStatus);
    } catch (error) {
      setStatusError(
        `${application.job_title} could not be moved. Its previous status was restored.`,
      );
      console.error(error);
    } finally {
      setUpdatingIds((current) => {
        const next = new Set(current);
        next.delete(application.id);
        return next;
      });
    }
  }

  function toggleColumn(status: ApplicationStatus) {
    setVisibleStatuses((current) => {
      const selected = new Set(current);
      if (selected.has(status)) selected.delete(status);
      else selected.add(status);
      return APPLICATION_STATUSES
        .map(({ value }) => value)
        .filter((value) => selected.has(value));
    });
  }

  function handleDragStart(
    event: DragEvent<HTMLElement>,
    application: Application,
  ) {
    setDraggedApplicationId(application.id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(application.id));
  }

  function handleDrop(event: DragEvent<HTMLElement>, status: ApplicationStatus) {
    event.preventDefault();
    const applicationId = Number(event.dataTransfer.getData('text/plain'));
    const application = applications.find((item) => item.id === applicationId);
    setDraggedApplicationId(null);
    setDragOverStatus(null);
    if (application) void changeStatus(application, status);
  }

  function cancelLongPress() {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }

  function finishTouchDrag() {
    cancelLongPress();
    touchStartRef.current = null;
    touchDraggingRef.current = null;
    touchDropStatusRef.current = null;
    setDraggedApplicationId(null);
    setDragOverStatus(null);
  }

  function handlePointerDown(
    event: ReactPointerEvent<HTMLElement>,
    application: Application,
  ) {
    if (event.pointerType !== 'touch') return;
    if (
      event.target instanceof Element
      && event.target.closest('select, a, .application-kanban-card__status')
    ) return;
    touchStartRef.current = { x: event.clientX, y: event.clientY };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic and older browser pointer events can omit capture support.
    }
    cancelLongPress();
    longPressTimerRef.current = setTimeout(() => {
      touchDraggingRef.current = application;
      touchDropStatusRef.current = application.status;
      setDraggedApplicationId(application.id);
      setDragOverStatus(application.status);
    }, LONG_PRESS_DELAY);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType !== 'touch') return;
    const touchApplication = touchDraggingRef.current;
    if (!touchApplication) {
      const start = touchStartRef.current;
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) {
        cancelLongPress();
      }
      return;
    }
    event.preventDefault();
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-kanban-status]');
    const status = target?.dataset.kanbanStatus as ApplicationStatus | undefined;
    if (status && visibleStatuses.includes(status)) {
      touchDropStatusRef.current = status;
      setDragOverStatus(status);
    }
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType !== 'touch') return;
    const application = touchDraggingRef.current;
    const targetStatus = touchDropStatusRef.current;
    if (application) {
      suppressOpenRef.current = true;
      setTimeout(() => {
        suppressOpenRef.current = false;
      }, 0);
      if (targetStatus) void changeStatus(application, targetStatus);
    }
    finishTouchDrag();
  }

  return (
    <div className="application-kanban-section">
      <p className="application-tracker-sr-only" id="kanban-drag-instructions">
        Drag a card to a visible column, long-press and drag on touch screens, or use its status menu.
      </p>
      <div className="application-kanban-controls">
        <div>
          <h2>Application board</h2>
          <span>{applications.length} matching {applications.length === 1 ? 'application' : 'applications'}</span>
        </div>
        <div className="application-column-manager">
          <button
            type="button"
            className="application-column-manager__trigger"
            aria-expanded={columnsOpen}
            aria-controls="application-column-options"
            onClick={() => setColumnsOpen((open) => !open)}
          >
            Manage columns
          </button>
          {columnsOpen && (
            <fieldset id="application-column-options" className="application-column-manager__panel">
              <legend>Visible status columns</legend>
              {APPLICATION_STATUSES.map(({ value, label }) => (
                <label key={value}>
                  <input
                    type="checkbox"
                    checked={visibleStatuses.includes(value)}
                    onChange={() => toggleColumn(value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
          )}
        </div>
      </div>

      {statusError && <p className="application-kanban-error" role="alert">{statusError}</p>}

      {visibleStatuses.length === 0 ? (
        <div className="application-kanban-empty">
          <span className="application-tracker-state__badge">No columns selected</span>
          <h2>Choose the stages you want to see.</h2>
          <p>Your applications are unchanged and remain available in List view.</p>
          <button type="button" onClick={() => setColumnsOpen(true)}>Manage columns</button>
        </div>
      ) : (
        <div className="application-kanban-board" aria-label="Application status board">
          {APPLICATION_STATUSES.filter(({ value }) => visibleStatuses.includes(value)).map(
            ({ value, label }) => {
              const columnApplications = applications.filter(
                (application) => application.status === value,
              );
              const dropActive = dragOverStatus === value;
              return (
                <section
                  className={`application-kanban-column${dropActive ? ' application-kanban-column--drop' : ''}`}
                  data-kanban-status={value}
                  aria-labelledby={`kanban-column-${value}`}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDragOverStatus(value);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleDrop(event, value)}
                  key={value}
                >
                  <header>
                    <h3 id={`kanban-column-${value}`}>{label}</h3>
                    <span aria-label={`${columnApplications.length} ${columnApplications.length === 1 ? 'application' : 'applications'}`}>
                      {columnApplications.length}
                    </span>
                  </header>
                  <div className="application-kanban-column__cards">
                    {columnApplications.length === 0 && (
                      <p className="application-kanban-column__empty">
                        Drop an application here
                      </p>
                    )}
                    {columnApplications.map((application) => {
                      const arrangement = getOptionLabel(
                        application.work_arrangement,
                        WORK_ARRANGEMENTS,
                      );
                      const employment = getOptionLabel(
                        application.employment_type,
                        EMPLOYMENT_TYPES,
                      );
                      const overdue = isReminderOverdue(application);
                      const updating = updatingIds.has(application.id);
                      return (
                        <article
                          className={`application-kanban-card${draggedApplicationId === application.id ? ' application-kanban-card--dragging' : ''}`}
                          draggable={!updating}
                          aria-describedby="kanban-drag-instructions"
                          onDragStart={(event) => handleDragStart(event, application)}
                          onDragEnd={() => {
                            setDraggedApplicationId(null);
                            setDragOverStatus(null);
                          }}
                          onPointerDown={(event) => handlePointerDown(event, application)}
                          onPointerMove={handlePointerMove}
                          onPointerUp={handlePointerUp}
                          onPointerCancel={finishTouchDrag}
                          key={application.id}
                        >
                          <button
                            type="button"
                            className="application-kanban-card__details"
                            onClick={() => {
                              if (suppressOpenRef.current) {
                                suppressOpenRef.current = false;
                                return;
                              }
                              onOpenApplication(application);
                            }}
                          >
                            <span className="application-kanban-card__source">
                              {application.source === 'squareone' ? 'SquareOne listing' : 'Manual entry'}
                            </span>
                            <strong>{application.job_title || 'Job title unavailable'}</strong>
                            <span className="application-kanban-card__company">
                              {application.company || 'Company unavailable'}
                            </span>
                            {application.location && (
                              <span className="application-kanban-card__location">⌖ {application.location}</span>
                            )}
                            {(arrangement || employment) && (
                              <span className="application-kanban-card__tags">
                                {arrangement && <span>{arrangement}</span>}
                                {employment && <span>{employment}</span>}
                              </span>
                            )}
                            {application.applied_date && (
                              <span className="application-kanban-card__date">
                                Applied {formatDate(application.applied_date)}
                              </span>
                            )}
                            {application.next_reminder && (
                              <span className={`application-kanban-card__reminder${overdue ? ' application-kanban-card__reminder--overdue' : ''}`}>
                                <span>{overdue ? 'Overdue' : 'Next follow-up'}</span>
                                <strong>{application.next_reminder.title}</strong>
                                <time dateTime={application.next_reminder.due_date}>
                                  {formatDate(application.next_reminder.due_date)}
                                </time>
                              </span>
                            )}
                            {application.archived_at && (
                              <span className="application-archived-badge">Archived</span>
                            )}
                          </button>
                          <label className="application-kanban-card__status">
                            <span>Move to</span>
                            <select
                              aria-label={`Change status for ${application.job_title}`}
                              value={application.status}
                              disabled={updating}
                              onChange={(event) => void changeStatus(
                                application,
                                event.target.value as ApplicationStatus,
                              )}
                            >
                              {APPLICATION_STATUSES.map((option) => (
                                <option value={option.value} key={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          {updating && <span className="application-kanban-card__saving" role="status">Saving…</span>}
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            },
          )}
        </div>
      )}
    </div>
  );
}

export default ApplicationKanbanBoard;
