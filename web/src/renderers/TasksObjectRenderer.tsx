import { useState } from "react";
import type { FormEvent } from "react";
import type { TaskLaneState, TasksObjectState } from "../domain/types";
import { Icon } from "../icons/Icon";
import { IconButton } from "../components/IconButton";
import type { WorkspaceObjectRendererProps } from "./types";

const emptyTasksState: TasksObjectState = {
  kind: "tasks",
  lanes: []
};

export function TasksObjectRenderer({ objectKey, objectState, onChangeObjectState }: WorkspaceObjectRendererProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const tasksState = objectState?.kind === "tasks" ? objectState : emptyTasksState;
  const totalItems = tasksState.lanes.reduce((sum, lane) => sum + lane.items.length, 0);

  function commit(nextState: TasksObjectState) {
    if (!objectKey) return;
    onChangeObjectState(objectKey, nextState);
  }

  function setLaneDraft(laneId: string, value: string) {
    setDrafts((current) => ({ ...current, [laneId]: value }));
  }

  function addTask(event: FormEvent<HTMLFormElement>, lane: TaskLaneState) {
    event.preventDefault();
    const text = drafts[lane.id]?.trim();
    if (!text) return;

    commit({
      ...tasksState,
      lanes: tasksState.lanes.map((candidate) =>
        candidate.id === lane.id ? { ...candidate, items: [...candidate.items, text] } : candidate
      )
    });
    setLaneDraft(lane.id, "");
  }

  function removeTask(laneId: string, taskIndex: number) {
    commit({
      ...tasksState,
      lanes: tasksState.lanes.map((lane) =>
        lane.id === laneId
          ? { ...lane, items: lane.items.filter((_, index) => index !== taskIndex) }
          : lane
      )
    });
  }

  return (
    <article className="viewer tasks-view" tabIndex={0}>
      <header className="tasks-header">
        <div>
          <h1>Tasks</h1>
          <p>Lane-based work items stored as workspace object state.</p>
        </div>
        <dl className="tasks-stats" aria-label="Task board status">
          <div>
            <dt>Lanes</dt>
            <dd>{tasksState.lanes.length}</dd>
          </div>
          <div>
            <dt>Items</dt>
            <dd>{totalItems}</dd>
          </div>
        </dl>
      </header>

      <section className="tasks-board" aria-label="Task lanes">
        {tasksState.lanes.map((lane) => (
          <section className="tasks-lane" key={lane.id} aria-label={lane.title}>
            <header className="tasks-lane-header">
              <h2>{lane.title}</h2>
              <span>{lane.items.length}</span>
            </header>
            <div className="tasks-lane-items">
              {lane.items.map((item, index) => (
                <div className="tasks-item" key={`${item}-${index}`}>
                  <span>{item}</span>
                  <IconButton label="Delete task" onClick={() => removeTask(lane.id, index)}>
                    <Icon name="item.delete" size={15} />
                  </IconButton>
                </div>
              ))}
              {lane.items.length === 0 && <div className="tasks-empty">No tasks</div>}
            </div>
            <form className="tasks-add-form" onSubmit={(event) => addTask(event, lane)}>
              <input
                value={drafts[lane.id] ?? ""}
                onChange={(event) => setLaneDraft(lane.id, event.currentTarget.value)}
                placeholder="Add task"
                aria-label={`Add task to ${lane.title}`}
              />
              <IconButton label="Add task" type="submit">
                <Icon name="item.add" size={16} />
              </IconButton>
            </form>
          </section>
        ))}
      </section>
    </article>
  );
}
