import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Plus, Trash2 } from 'lucide-react';
import type { CalendarEvent, KnoterClient, WorkspaceSnapshot } from '@knoter/contracts';
import { Button } from '../components/ui/button';
import { Dialog } from '../components/ui/dialog';
import { localDate } from '../api/seed';
import type { RunAction } from './WikiView';

export function CalendarView({
  snapshot,
  client,
  run,
}: {
  snapshot: WorkspaceSnapshot;
  client: KnoterClient;
  run: RunAction;
}) {
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selected, setSelected] = useState(localDate());
  const [draft, setDraft] = useState<(Omit<CalendarEvent, 'id'> & { id?: string }) | null>(null);
  const [saving, setSaving] = useState(false);
  const first = new Date(month);
  first.setDate(1 - ((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(first);
    d.setDate(d.getDate() + i);
    return d;
  });
  const events = snapshot.events
    .filter((e) => e.date === selected)
    .sort((a, b) => a.time.localeCompare(b.time));
  const tasks = snapshot.tasks.filter((t) => t.dueDate === selected && !t.done);
  const add = (date = selected) =>
    setDraft({ title: '', date, time: '10:00', duration: 60, color: 'green', description: '' });
  const save = async () => {
    if (!draft) return;
    setSaving(true);
    const success = await run(
      () => client.saveEvent(draft),
      draft.id ? 'Event updated.' : 'A little time, set aside.',
    );
    setSaving(false);
    if (success) {
      setSelected(draft.date);
      setDraft(null);
    }
  };
  return (
    <div className="collection-page calendar-page page-enter">
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE ROOM FOR WHAT MATTERS</div>
          <h1>Time to think</h1>
          <p>Your research rhythm, one day at a time.</p>
        </div>
        <Button onClick={() => add()}>
          <Plus /> New event
        </Button>
      </div>
      <div className="calendar-toolbar">
        <h2>{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
              setSelected(localDate());
            }}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous month"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next month"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div className="calendar-layout">
        <div className="month-grid" role="group" aria-label="Month calendar">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
            <div className="weekday" key={day}>
              {day}
            </div>
          ))}
          {days.map((date) => {
            const key = localDate(date);
            const dayEvents = snapshot.events.filter((e) => e.date === key);
            const dayTasks = snapshot.tasks.filter((t) => !t.done && t.dueDate === key);
            return (
              <button
                aria-label={date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                aria-pressed={selected === key}
                key={key}
                className={`calendar-day ${date.getMonth() !== month.getMonth() ? 'outside-month' : ''} ${key === selected ? 'selected-day' : ''}`}
                onClick={() => setSelected(key)}
                onDoubleClick={() => add(key)}
              >
                <span className={`day-number ${key === localDate() ? 'today-number' : ''}`}>
                  {date.getDate()}
                </span>
                <div className="day-events">
                  {dayEvents.slice(0, 2).map((event) => (
                    <span className={`day-event event-${event.color}`} key={event.id}>
                      {event.title}
                    </span>
                  ))}
                  {dayTasks.length > 0 && (
                    <span className="day-task-dot">
                      <i />
                      {dayTasks.length} task{dayTasks.length > 1 ? 's' : ''}
                    </span>
                  )}
                  {dayEvents.length > 2 && (
                    <span className="more-events">+{dayEvents.length - 2} more</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <aside className="day-agenda">
          <div className="agenda-heading">
            <div>
              <span className="tiny-label">
                {new Date(`${selected}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })}
              </span>
              <h3>
                {new Date(`${selected}T12:00:00`).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                })}
              </h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Add event on selected date"
              onClick={() => add()}
            >
              <Plus />
            </Button>
          </div>
          {events.map((event) => (
            <button
              key={event.id}
              className={`agenda-event event-border-${event.color}`}
              onClick={() => setDraft({ ...event })}
            >
              <span>
                <Clock3 size={12} /> {event.time || 'All day'}{' '}
                {event.time && `· ${event.duration} min`}
              </span>
              <strong>{event.title}</strong>
              <p>{event.description}</p>
            </button>
          ))}
          {tasks.length > 0 && (
            <div className="agenda-tasks">
              <span className="tiny-label">TASKS DUE</span>
              {tasks.map((task) => (
                <div key={task.id}>
                  <span className="small-circle" />
                  {task.title}
                </div>
              ))}
            </div>
          )}
          {!events.length && !tasks.length && (
            <div className="agenda-empty">
              <CalendarDays size={27} />
              <p>A little open space.</p>
              <span>Make time for a good idea.</span>
              <Button variant="ghost" size="sm" onClick={() => add()}>
                Add an event
              </Button>
            </div>
          )}
          <div className="calendar-key">
            <span>
              <i className="key-green" />
              Research
            </span>
            <span>
              <i className="key-purple" />
              Reading
            </span>
            <span>
              <i className="key-amber" />
              Review
            </span>
          </div>
        </aside>
      </div>
      <Dialog
        open={!!draft}
        onOpenChange={(open) => {
          if (!open) setDraft(null);
        }}
        title={draft?.id ? 'Edit your time' : 'Make a little space'}
        description="Set aside time for the work that matters."
      >
        {draft && (
          <form
            className="dialog-form"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label>
              Event title
              <input
                autoFocus
                required
                placeholder="A focused reading session…"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <div className="form-grid">
              <label>
                Date
                <input
                  type="date"
                  required
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </label>
              <label>
                Time
                <input
                  type="time"
                  value={draft.time}
                  onChange={(e) => setDraft({ ...draft, time: e.target.value })}
                />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Duration
                <select
                  value={draft.duration}
                  onChange={(e) => setDraft({ ...draft, duration: Number(e.target.value) })}
                >
                  {[15, 30, 45, 60, 90, 120].map((n) => (
                    <option key={n} value={n}>
                      {n} minutes
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Kind
                <select
                  value={draft.color}
                  onChange={(e) =>
                    setDraft({ ...draft, color: e.target.value as CalendarEvent['color'] })
                  }
                >
                  <option value="green">Research</option>
                  <option value="purple">Reading</option>
                  <option value="amber">Review</option>
                </select>
              </label>
            </div>
            <label>
              A note for yourself
              <textarea
                rows={3}
                placeholder="What would you like to explore?"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </label>
            <div className="dialog-actions">
              {draft.id && (
                <Button
                  type="button"
                  variant="destructive"
                  className="mr-auto"
                  onClick={() =>
                    void run(() => client.deleteEvent(draft.id!), 'Event removed.').then((ok) => {
                      if (ok) setDraft(null);
                    })
                  }
                >
                  <Trash2 />
                  Delete
                </Button>
              )}
              <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!draft.title.trim() || !draft.date || saving}>
                Save event
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
