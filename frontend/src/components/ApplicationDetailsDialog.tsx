import { isAxiosError } from 'axios';
import { useEffect, useRef, useState, type FormEvent } from 'react';
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

interface ApplicationDetailsDialogProps {
  application: Application;
  onClose: () => void;
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
          <span className="application-dialog__eyebrow">Follow-up center</span>
          <h2 id="application-details-title">{application.job_title}</h2>
          <p>{application.company}{application.archived_at ? ' · Archived' : ''}</p>
        </div>
        <button
          className="application-dialog__close"
          type="button"
          aria-label="Close follow-up center"
          onClick={() => {
            dialogRef.current?.close();
            onClose();
          }}
        >
          ×
        </button>
      </div>

      {loading && <p role="status">Loading reminders and activity…</p>}
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
