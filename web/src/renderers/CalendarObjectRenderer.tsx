import { useState } from "react";
import type { FormEvent } from "react";
import type { CalendarObjectState } from "../domain/types";
import { Icon } from "../icons/Icon";
import { IconButton } from "../components/IconButton";
import type { WorkspaceObjectRendererProps } from "./types";

const emptyCalendarState: CalendarObjectState = {
  kind: "calendar",
  events: []
};

export function CalendarObjectRenderer({ objectKey, objectState, onChangeObjectState }: WorkspaceObjectRendererProps) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayDate());
  const calendarState = objectState?.kind === "calendar" ? objectState : emptyCalendarState;
  const sortedEvents = [...calendarState.events].sort((left, right) => left.date.localeCompare(right.date));

  function commit(nextState: CalendarObjectState) {
    if (!objectKey) return;
    onChangeObjectState(objectKey, nextState);
  }

  function addEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle || !date) return;

    commit({
      ...calendarState,
      events: [
        ...calendarState.events,
        {
          id: crypto.randomUUID(),
          title: nextTitle,
          date
        }
      ]
    });
    setTitle("");
  }

  function removeEvent(eventId: string) {
    commit({
      ...calendarState,
      events: calendarState.events.filter((event) => event.id !== eventId)
    });
  }

  return (
    <article className="viewer calendar-view" tabIndex={0}>
      <header className="calendar-header">
        <div>
          <h1>Calendar</h1>
          <p>Time-based workspace events stored as object state.</p>
        </div>
        <dl className="calendar-stats" aria-label="Calendar status">
          <div>
            <dt>Events</dt>
            <dd>{calendarState.events.length}</dd>
          </div>
        </dl>
      </header>

      <form className="calendar-add-form" onSubmit={addEvent}>
        <input
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          placeholder="Event title"
          aria-label="Event title"
        />
        <input
          value={date}
          type="date"
          onChange={(event) => setDate(event.currentTarget.value)}
          aria-label="Event date"
        />
        <IconButton label="Add event" type="submit">
          <Icon name="item.add" size={16} />
        </IconButton>
      </form>

      <section className="calendar-list" aria-label="Calendar events">
        {sortedEvents.length > 0 ? (
          sortedEvents.map((event) => (
            <div className="calendar-event" key={event.id}>
              <time dateTime={event.date}>{event.date}</time>
              <span>{event.title}</span>
              <IconButton label="Delete event" onClick={() => removeEvent(event.id)}>
                <Icon name="item.delete" size={15} />
              </IconButton>
            </div>
          ))
        ) : (
          <div className="calendar-empty">No events</div>
        )}
      </section>
    </article>
  );
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}
