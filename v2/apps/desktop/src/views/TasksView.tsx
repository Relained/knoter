import { useState } from 'react';
import { ArrowUpRight, Check, CheckCheck, Circle, Flag, Plus } from 'lucide-react';
import type { KnoterClient, Task, WorkspaceSnapshot } from '@knoter/contracts';
import { Button } from '../components/ui/button';
import { Dialog } from '../components/ui/dialog';
import { dateLabel } from '../components/helpers';
import { localDate } from '../api/seed';
import type { RunAction } from './WikiView';

export function TasksView({
  snapshot,
  client,
  run,
  onOpen,
}: {
  snapshot: WorkspaceSnapshot;
  client: KnoterClient;
  run: RunAction;
  onOpen: (id: string) => void;
}) {
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(localDate());
  const [priority, setPriority] = useState<Task['priority']>('medium');
  const [saving, setSaving] = useState(false);
  const done = snapshot.tasks.filter((t) => t.done).length;
  const items = snapshot.tasks.filter((t) =>
    filter === 'done' ? t.done : !t.done && (filter !== 'today' || t.dueDate === localDate()),
  );
  const groups =
    filter === 'done'
      ? ([['Completed', items]] as const)
      : ([
          ['Today & overdue', items.filter((t) => t.dueDate && t.dueDate <= localDate())],
          ['Up next', items.filter((t) => !t.dueDate || t.dueDate > localDate())],
        ] as const);
  const add = async () => {
    setSaving(true);
    const success = await run(() => client.createTask({ title, dueDate, priority }), 'Task added.');
    setSaving(false);
    if (success) {
      setTitle('');
      setOpen(false);
    }
  };
  return (
    <div className="collection-page tasks-page page-enter">
      <div className="page-heading">
        <div>
          <div className="eyebrow">TURN KNOWLEDGE INTO PROGRESS</div>
          <h1>A little forward motion</h1>
          <p>The next steps that grow out of your notes.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus /> New task
        </Button>
      </div>
      <div className="task-progress">
        <span className="progress-symbol">
          <CheckCheck size={25} />
        </span>
        <div>
          <strong>
            {done} of {snapshot.tasks.length} tasks completed
          </strong>
          <span>Small steps add up. Keep going at your own pace.</span>
        </div>
        <progress aria-label="Task completion" value={done} max={snapshot.tasks.length || 1} />
      </div>
      <div className="list-toolbar">
        <div className="segmented">
          {[
            ['all', 'Open tasks'],
            ['today', 'Today'],
            ['done', 'Completed'],
          ].map(([id, label]) => (
            <button
              className={filter === id ? 'selected' : ''}
              key={id}
              onClick={() => setFilter(id)}
            >
              {label}
              <span>
                {id === 'done'
                  ? done
                  : id === 'all'
                    ? snapshot.tasks.length - done
                    : snapshot.tasks.filter((t) => !t.done && t.dueDate === localDate()).length}
              </span>
            </button>
          ))}
        </div>
        <span className="tiny-label">Your changes are saved locally</span>
      </div>
      {groups.map(
        ([label, tasks]) =>
          tasks.length > 0 && (
            <section key={label} className="task-group">
              <div className="section-heading">
                <h2>{label}</h2>
                <span>{tasks.length}</span>
              </div>
              {tasks.map((task) => (
                <div className={`task-row ${task.done ? 'is-done' : ''}`} key={task.id}>
                  <button
                    className="task-checkbox"
                    aria-label={task.done ? `Reopen ${task.title}` : `Complete ${task.title}`}
                    role="checkbox"
                    aria-checked={task.done}
                    onClick={() => void run(() => client.updateTask(task.id, { done: !task.done }))}
                  >
                    {task.done ? <Check size={13} /> : <Circle size={19} />}
                  </button>
                  <div className="task-content">
                    <strong>{task.title}</strong>
                    {task.documentId && (
                      <button onClick={() => onOpen(task.documentId!)}>
                        {snapshot.documents.find((d) => d.id === task.documentId)?.title}
                        <ArrowUpRight size={11} />
                      </button>
                    )}
                  </div>
                  <span
                    className={`priority priority-${task.priority}`}
                    title={`${task.priority} priority`}
                  >
                    <Flag size={13} />
                    {task.priority}
                  </span>
                  <input
                    type="date"
                    className="task-date"
                    aria-label={`Due date for ${task.title}`}
                    value={task.dueDate}
                    onChange={(e) =>
                      void run(() => client.updateTask(task.id, { dueDate: e.target.value }))
                    }
                    title={task.dueDate ? dateLabel(task.dueDate) : 'Set a date'}
                  />
                </div>
              ))}
            </section>
          ),
      )}
      {!items.length && (
        <div className="empty-state">
          <CheckCheck />
          <h3>
            {filter === 'done' ? 'Your progress will appear here' : 'A little breathing room'}
          </h3>
          <p>
            {filter === 'done'
              ? 'Complete a task to give your progress a home.'
              : 'There are no tasks in this view. Make space for the next good idea.'}
          </p>
        </div>
      )}
      <button className="add-row" onClick={() => setOpen(true)}>
        <Plus size={16} /> Add a next step
      </button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="A new next step"
        description="Keep it small enough to start."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
          className="dialog-form"
        >
          <label>
            Task
            <input
              autoFocus
              placeholder="What would you like to do?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>
          <div className="form-grid">
            <label>
              Due date
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
            <label>
              Priority
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Task['priority'])}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>
          <div className="dialog-actions">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || saving}>
              Add task
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
