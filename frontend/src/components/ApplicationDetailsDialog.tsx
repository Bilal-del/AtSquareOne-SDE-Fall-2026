import { isAxiosError } from 'axios';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  createApplicationReminder,
  deleteApplicationReminder,
  getApplicationActivity,
  getApplicationReminders,
  setApplicationRemindersEnabled,
  updateApplicationReminder,
  type Application,
  type ApplicationActivity,
  type ApplicationReminder,
} from '../api/applications';
import {
  EMPLOYMENT_TYPES,
  WORK_ARRANGEMENTS,
} from '../constants/applicationFields';
import { APPLICATION_STATUS_LABELS } from '../constants/applicationStatuses';

interface ApplicationDetailsDialogProps {
  application: Application;
  onClose: () => void;
  onEdit?: (application: Application) => void;
  onArchiveChange?: (application: Application) => void;
  onDelete?: (application: Application) => void;
}

function formatDate(value: string | null): string {
  if (!value) return 'Not provided';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function getFieldLabel(
  value: string,
  options: readonly { value: string; label: string }[],
): string {
  return options.find((option) => option.value === value)?.label ?? 'Not specified';
}

function sortReminders(reminders: ApplicationReminder[]) {
  return [...reminders].sort((first, second) => {
    const firstValue = `${first.due_date}T${first.due_time ?? '23:59:59'}`;
    const secondValue = `${second.due_date}T${second.due_time ?? '23:59:59'}`;
    return firstValue.localeCompare(secondValue) || first.id - second.id;
  });
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getReminderTiming(reminder: ApplicationReminder): 'Overdue' | 'Upcoming' {
  const due = new Date(
    `${reminder.due_date}T${reminder.due_time?.slice(0, 5) ?? '23:59'}`,
  );
  return due.getTime() < Date.now() ? 'Overdue' : 'Upcoming';
}

function formatReminderDue(reminder: ApplicationReminder): string {
  const date = new Date(`${reminder.due_date}T00:00:00`);
  const formattedDate = Number.isNaN(date.getTime())
    ? reminder.due_date
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
  if (!reminder.due_time) return formattedDate;
  const time = new Date(`2000-01-01T${reminder.due_time.slice(0, 5)}:00`);
  const formattedTime = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(time);
  return `${formattedDate} at ${formattedTime}`;
}

function ApplicationDetailsDialog({
  application,
  onClose,
  onEdit,
  onArchiveChange,
  onDelete,
}: ApplicationDetailsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reminders, setReminders] = useState<ApplicationReminder[]>([]);
  const [activities, setActivities] = useState<ApplicationActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [editingReminder, setEditingReminder] = useState<ApplicationReminder | null>(null);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [note, setNote] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    Promise.all([
      getApplicationReminders(application.id),
      getApplicationActivity(application.id),
    ])
      .then(([reminderData, activityData]) => {
        if (active) {
          setReminders(sortReminders(reminderData));
          setActivities(activityData);
        }
      })
      .catch((error) => {
        if (active) {
          setLoadError('Reminders and activity could not be loaded.');
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

  function resetForm() {
    setEditingReminder(null);
    setTitle('');
    setDueDate('');
    setDueTime('');
    setNote('');
    setFieldErrors({});
  }

  function startEditing(reminder: ApplicationReminder) {
    setEditingReminder(reminder);
    setTitle(reminder.title);
    setDueDate(reminder.due_date);
    setDueTime(reminder.due_time?.slice(0, 5) ?? '');
    setNote(reminder.note);
    setFieldErrors({});
    setOperationError(null);
  }

  function updateRequiredField(
    field: 'title' | 'due_date',
    value: string,
    setter: (nextValue: string) => void,
  ) {
    setter(value);
    if (value.trim()) {
      setFieldErrors((current) => {
        if (!current[field]) return current;
        const next = { ...current };
        delete next[field];
        return next;
      });
    }
  }

  async function saveReminder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors: Record<string, string> = {};
    if (!title.trim()) errors.title = 'Reminder title is required.';
    if (!dueDate) errors.due_date = 'Due date is required.';
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSaving(true);
    setOperationError(null);
    setFieldErrors({});
    try {
      const input = {
        title: title.trim(),
        due_date: dueDate,
        due_time: dueTime || null,
        note,
      };
      const saved = editingReminder
        ? await updateApplicationReminder(application.id, editingReminder.id, input)
        : await createApplicationReminder(application.id, input);
      setReminders((current) => sortReminders(
        editingReminder
          ? current.map((reminder) => reminder.id === saved.id ? saved : reminder)
          : [...current, saved],
      ));
      resetForm();
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 400) {
        const responseErrors: Record<string, string> = {};
        Object.entries(error.response.data as Record<string, unknown>).forEach(
          ([field, value]) => {
            responseErrors[field] = Array.isArray(value)
              ? value.join(' ')
              : String(value);
          },
        );
        setFieldErrors(responseErrors);
      } else {
        setOperationError('The reminder could not be saved. Try again.');
      }
      console.error(error);
    } finally {
      setSaving(false);
    }
  }

  async function toggleReminder(reminder: ApplicationReminder) {
    setOperationError(null);
    try {
      const updated = await updateApplicationReminder(
        application.id,
        reminder.id,
        { enabled: !reminder.enabled },
      );
      setReminders((current) => current.map((item) =>
        item.id === updated.id ? updated : item
      ));
    } catch (error) {
      setOperationError('The reminder setting could not be changed.');
      console.error(error);
    }
  }

  async function toggleAllReminders() {
    const enable = !reminders.some((reminder) => reminder.enabled);
    setOperationError(null);
    try {
      await setApplicationRemindersEnabled(application.id, enable);
      setReminders((current) => current.map((reminder) => ({
        ...reminder,
        enabled: enable,
      })));
    } catch (error) {
      setOperationError('Application reminder settings could not be changed.');
      console.error(error);
    }
  }

  async function removeReminder(reminder: ApplicationReminder) {
    setOperationError(null);
    try {
      await deleteApplicationReminder(application.id, reminder.id);
      setReminders((current) => current.filter((item) => item.id !== reminder.id));
      if (editingReminder?.id === reminder.id) resetForm();
    } catch (error) {
      setOperationError('The reminder could not be deleted.');
      console.error(error);
    }
  }

  const anyRemindersEnabled = reminders.some(
    (reminder) => reminder.enabled,
  );

  return (
    <dialog
      className="application-dialog application-dialog--details"
      ref={dialogRef}
      aria-labelledby="application-details-title"
      onCancel={onClose}
      onClose={onClose}
    >
      <div className="application-dialog__heading">
        <div>
          <span className="application-dialog__eyebrow">Application details</span>
          <h2 id="application-details-title">{application.job_title}</h2>
          <p>{application.company}{application.archived_at ? ' · Archived' : ''}</p>
        </div>
        <button
          className="application-dialog__close"
          type="button"
          aria-label="Close application details"
          onClick={() => {
            dialogRef.current?.close();
            onClose();
          }}
        >
          ×
        </button>
      </div>

      <div className="application-details-actions" aria-label="Application management actions">
        {onEdit && (
          <button type="button" onClick={() => onEdit(application)}>Edit application</button>
        )}
        {onArchiveChange && (
          <button
            type="button"
            className="application-dialog__secondary"
            onClick={() => onArchiveChange(application)}
          >
            {application.archived_at ? 'Restore application' : 'Archive application'}
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            className="application-details-actions__danger"
            onClick={() => onDelete(application)}
          >
            Permanently delete
          </button>
        )}
      </div>

      <div className="application-details-summary">
        <section aria-labelledby="job-information-heading">
          <h3 id="job-information-heading">Job information</h3>
          <dl className="application-details-fields">
            <div><dt>Job title</dt><dd>{application.job_title || 'Not available'}</dd></div>
            <div><dt>Company</dt><dd>{application.company || 'Not available'}</dd></div>
            <div><dt>Location</dt><dd>{application.location || 'Not specified'}</dd></div>
            <div>
              <dt>Source</dt>
              <dd>{application.source === 'squareone' ? 'SquareOne job listing' : 'Manual application'}</dd>
            </div>
            <div>
              <dt>Job posting</dt>
              <dd>
                {application.job ? (
                  <Link to={`/jobs/${application.job}`}>View SquareOne listing</Link>
                ) : application.external_job_url ? (
                  <a href={application.external_job_url} target="_blank" rel="noreferrer">Open external posting</a>
                ) : 'Not provided'}
              </dd>
            </div>
            <div>
              <dt>Work arrangement</dt>
              <dd>{getFieldLabel(application.work_arrangement, WORK_ARRANGEMENTS)}</dd>
            </div>
            <div>
              <dt>Employment type</dt>
              <dd>{getFieldLabel(application.employment_type, EMPLOYMENT_TYPES)}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="application-information-heading">
          <h3 id="application-information-heading">Application information</h3>
          <dl className="application-details-fields">
            <div>
              <dt>Status</dt>
              <dd><span className={`application-status application-status--${application.status}`}>{APPLICATION_STATUS_LABELS[application.status]}</span></dd>
            </div>
            <div><dt>Application date</dt><dd>{formatDate(application.applied_date)}</dd></div>
            <div><dt>Record state</dt><dd>{application.archived_at ? 'Archived' : 'Active'}</dd></div>
            <div><dt>Created</dt><dd>{formatDate(application.created_at)}</dd></div>
            <div><dt>Last updated</dt><dd>{formatDate(application.updated_at)}</dd></div>
            <div className="application-details-fields__wide">
              <dt>Personal notes</dt>
              <dd className={!application.notes ? 'application-details-fields__empty' : undefined}>
                {application.notes || 'No personal notes have been added.'}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {loading && <p className="application-details-loading" role="status">Loading reminders and activity…</p>}
      {loadError && (
        <div className="application-dialog__error" role="alert">
          <p>{loadError}</p>
          <button type="button" onClick={() => setReloadKey((value) => value + 1)}>
            Retry
          </button>
        </div>
      )}

      {!loading && !loadError && (
        <div className="application-details-layout">
          <section aria-labelledby="reminders-heading">
            <div className="application-details-section-heading">
              <div>
                <h3 id="reminders-heading">Reminders</h3>
                <span>One-time in-app follow-up deadlines</span>
              </div>
              {reminders.length > 0 && (
                <button
                  className="application-reminder-bell"
                  type="button"
                  aria-label={`${anyRemindersEnabled ? 'Disable' : 'Enable'} all reminders for ${application.job_title}`}
                  onClick={toggleAllReminders}
                >
                  <span aria-hidden="true">🔔</span>
                  {anyRemindersEnabled ? 'Disable all' : 'Enable all'}
                </button>
              )}
            </div>

            {operationError && <p className="application-dialog__error" role="alert">{operationError}</p>}

            {reminders.length === 0 ? (
              <p className="application-details-empty">No reminders yet.</p>
            ) : (
              <ul className="application-reminder-list">
                {reminders.map((reminder) => {
                  const timing = getReminderTiming(reminder);
                  return (
                    <li className={!reminder.enabled ? 'application-reminder application-reminder--disabled' : 'application-reminder'} key={reminder.id}>
                      <button
                        className="application-reminder-toggle"
                        type="button"
                        aria-label={`${reminder.enabled ? 'Disable' : 'Enable'} reminder ${reminder.title}`}
                        aria-pressed={reminder.enabled}
                        onClick={() => toggleReminder(reminder)}
                      >
                        <span aria-hidden="true" />
                      </button>
                      <div className="application-reminder__content">
                        <div>
                          <strong>{reminder.title}</strong>
                          <span className={`application-reminder__timing application-reminder__timing--${timing.toLowerCase()}`}>
                            {timing}
                          </span>
                        </div>
                        <span>{formatReminderDue(reminder)}</span>
                        {reminder.note && <p>{reminder.note}</p>}
                      </div>
                      <div className="application-reminder__actions">
                        <button type="button" onClick={() => startEditing(reminder)}>Edit</button>
                        <button type="button" onClick={() => removeReminder(reminder)}>Delete</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <form className="application-reminder-form" onSubmit={saveReminder}>
              <h4>{editingReminder ? 'Edit reminder' : 'Add reminder'}</h4>
              <label className="application-dialog__field">
                <span>Reminder title *</span>
                <input
                  value={title}
                  onChange={(event) => updateRequiredField('title', event.target.value, setTitle)}
                />
                {fieldErrors.title && <small role="alert">{fieldErrors.title}</small>}
              </label>
              <div className="application-dialog__grid">
                <label className="application-dialog__field">
                  <span>Due date *</span>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(event) => updateRequiredField('due_date', event.target.value, setDueDate)}
                  />
                  {fieldErrors.due_date && <small role="alert">{fieldErrors.due_date}</small>}
                </label>
                <label className="application-dialog__field">
                  <span>Due time</span>
                  <input type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value)} />
                </label>
              </div>
              <label className="application-dialog__field">
                <span>Additional note</span>
                <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
              </label>
              {Object.entries(fieldErrors)
                .filter(([field]) => !['title', 'due_date'].includes(field))
                .map(([field, message]) => <p className="application-dialog__error" role="alert" key={field}>{message}</p>)}
              <div className="application-dialog__actions">
                {editingReminder && (
                  <button type="button" className="application-dialog__secondary" onClick={resetForm}>
                    Cancel edit
                  </button>
                )}
                <button type="submit" disabled={saving}>
                  {saving ? 'Saving…' : editingReminder ? 'Save reminder' : 'Add reminder'}
                </button>
              </div>
            </form>
          </section>

          <section aria-labelledby="activity-heading">
            <div className="application-details-section-heading">
              <div>
                <h3 id="activity-heading">Activity</h3>
                <span>Recorded automatically by SquareOne</span>
              </div>
            </div>
            {activities.length === 0 ? (
              <p className="application-details-empty">No activity has been recorded since history was enabled.</p>
            ) : (
              <ol className="application-activity-list">
                {activities.map((activity) => (
                  <li key={activity.id}>
                    <span aria-hidden="true" />
                    <div>
                      <strong>{activity.description}</strong>
                      <time dateTime={activity.created_at}>{formatTimestamp(activity.created_at)}</time>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </dialog>
  );
}

export default ApplicationDetailsDialog;
