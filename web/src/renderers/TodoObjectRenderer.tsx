import { useState } from "react";
import type { FormEvent } from "react";
import type { TodoItemState, TodoObjectState } from "../domain/types";
import { Icon } from "../icons/Icon";
import { IconButton } from "../components/IconButton";
import type { WorkspaceObjectRendererProps } from "./types";

const emptyTodoState: TodoObjectState = {
  kind: "todo",
  items: []
};

export function TodoObjectRenderer({ objectKey, objectState, onChangeObjectState }: WorkspaceObjectRendererProps) {
  const [draft, setDraft] = useState("");
  const todoState = objectState?.kind === "todo" ? objectState : emptyTodoState;
  const openCount = todoState.items.filter((item) => !item.done).length;
  const doneCount = todoState.items.length - openCount;

  function commit(nextState: TodoObjectState) {
    if (!objectKey) return;
    onChangeObjectState(objectKey, nextState);
  }

  function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;

    commit({
      ...todoState,
      items: [
        ...todoState.items,
        {
          id: crypto.randomUUID(),
          text,
          done: false
        }
      ]
    });
    setDraft("");
  }

  function toggleItem(item: TodoItemState) {
    commit({
      ...todoState,
      items: todoState.items.map((candidate) =>
        candidate.id === item.id ? { ...candidate, done: !candidate.done } : candidate
      )
    });
  }

  function removeItem(itemId: string) {
    commit({
      ...todoState,
      items: todoState.items.filter((item) => item.id !== itemId)
    });
  }

  return (
    <article className="viewer todo-view" tabIndex={0}>
      <header className="todo-header">
        <div>
          <h1>Todo</h1>
          <p>Short-lived action items stored as workspace object state.</p>
        </div>
        <dl className="todo-stats" aria-label="Todo status">
          <div>
            <dt>Open</dt>
            <dd>{openCount}</dd>
          </div>
          <div>
            <dt>Done</dt>
            <dd>{doneCount}</dd>
          </div>
        </dl>
      </header>

      <form className="todo-add-form" onSubmit={addItem}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          placeholder="Add todo"
          aria-label="Todo text"
        />
        <IconButton label="Add todo" type="submit">
          <Icon name="item.add" size={16} />
        </IconButton>
      </form>

      <section className="todo-list" aria-label="Todo items">
        {todoState.items.length > 0 ? (
          todoState.items.map((item) => (
            <div className={`todo-item ${item.done ? "is-done" : ""}`} key={item.id}>
              <input
                type="checkbox"
                checked={item.done}
                aria-label={item.done ? "Mark todo open" : "Mark todo done"}
                onChange={() => toggleItem(item)}
              />
              <span className="todo-text">{item.text}</span>
              <IconButton label="Delete todo" onClick={() => removeItem(item.id)}>
                <Icon name="item.delete" size={15} />
              </IconButton>
            </div>
          ))
        ) : (
          <div className="todo-empty">No todo items</div>
        )}
      </section>
    </article>
  );
}
