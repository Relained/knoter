import type { NoteObjectState, WorkspaceObjectKey } from "../domain/types";
import { isWorkspaceObjectKey, notes, workspaceObjects } from "../domain/workspace";
import { Graph3DObjectRenderer } from "./ObjectTemplateAdapters";
import { CalendarObjectRenderer } from "./CalendarObjectRenderer";
import { TasksObjectRenderer } from "./TasksObjectRenderer";
import { TodoObjectRenderer } from "./TodoObjectRenderer";
import type { WorkspaceObjectRendererProps } from "./types";
import { Icon } from "../icons/Icon";
import { IconButton } from "../components/IconButton";

const emptyNoteState: NoteObjectState = {
  kind: "note",
  content: "# Untitled\n\nStart writing.",
  mode: "split"
};

export function NoteObjectRenderer(props: WorkspaceObjectRendererProps) {
  const { objectKey, noteKey, objectState, onChangeObjectState } = props;
  const noteState = objectState?.kind === "note" ? objectState : emptyNoteState;
  const title = noteKey ? notes[noteKey]?.title ?? noteKey : "Untitled";

  function commit(patch: Partial<NoteObjectState>) {
    if (!objectKey) return;
    onChangeObjectState(objectKey, { ...noteState, ...patch });
  }

  return (
    <article className="viewer markdown-view" tabIndex={0}>
      <header className="markdown-header">
        <div>
          <h1>{title}</h1>
          <p>Markdown editor and viewer share one workspace object.</p>
        </div>
        <div className="markdown-mode-switch" role="group" aria-label="Markdown mode">
          {(["edit", "preview", "split"] as const).map((mode) => (
            <button
              key={mode}
              className={noteState.mode === mode ? "is-active" : ""}
              type="button"
              onClick={() => commit({ mode })}
            >
              {mode}
            </button>
          ))}
        </div>
      </header>

      <section className={`markdown-workspace markdown-mode-${noteState.mode}`}>
        {(noteState.mode === "edit" || noteState.mode === "split") && (
          <textarea
            className="markdown-editor"
            value={noteState.content}
            onChange={(event) => commit({ content: event.currentTarget.value })}
            aria-label={`${title} markdown editor`}
            spellCheck={true}
          />
        )}
        {(noteState.mode === "preview" || noteState.mode === "split") && (
          <div className="markdown-preview" aria-label={`${title} markdown preview`}>
            <MarkdownPreview content={noteState.content} rendererProps={props} />
          </div>
        )}
      </section>
    </article>
  );
}

function MarkdownPreview({ content, rendererProps }: { content: string; rendererProps: WorkspaceObjectRendererProps }) {
  const blocks = content.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  return (
    <>
      {blocks.map((block, index) => {
        const embeddedObjectKey = parseObjectEmbed(block);
        if (embeddedObjectKey) {
          return <EmbeddedObject key={index} objectKey={embeddedObjectKey} rendererProps={rendererProps} />;
        }
        if (block.startsWith("# ")) return <h1 key={index}>{block.slice(2)}</h1>;
        if (block.startsWith("## ")) return <h2 key={index}>{block.slice(3)}</h2>;
        if (block.startsWith("### ")) return <h3 key={index}>{block.slice(4)}</h3>;
        if (block.startsWith("- ")) {
          return (
            <ul key={index}>
              {block.split("\n").map((line, itemIndex) => (
                <li key={itemIndex}>{line.replace(/^- /, "")}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{block}</p>;
      })}
    </>
  );
}

function EmbeddedObject({
  objectKey,
  rendererProps
}: {
  objectKey: WorkspaceObjectKey;
  rendererProps: WorkspaceObjectRendererProps;
}) {
  const objectState = rendererProps.objectStates[objectKey] ?? null;
  const props = {
    ...rendererProps,
    objectKey,
    noteKey: null,
    objectState
  };
  const definition = workspaceObjects[objectKey];

  return (
    <section className="markdown-object-embed" aria-label={`${definition.title} embedded object`}>
      <header>
        <span>{definition.title}</span>
        <div className="markdown-object-actions">
          <IconButton label="Open in pane" onClick={() => rendererProps.onOpenObject(objectKey, "pane")}>
            <Icon name="layout.square" size={15} />
          </IconButton>
          <IconButton label="Open floating" onClick={() => rendererProps.onOpenObject(objectKey, "floating")}>
            <Icon name="layout.float" size={15} />
          </IconButton>
        </div>
      </header>
      {definition.kind === "graph3d" && <Graph3DObjectRenderer {...props} />}
      {definition.kind === "tasks" && <TasksObjectRenderer {...props} />}
      {definition.kind === "todo" && <TodoObjectRenderer {...props} />}
      {definition.kind === "calendar" && <CalendarObjectRenderer {...props} />}
    </section>
  );
}

function parseObjectEmbed(block: string): WorkspaceObjectKey | null {
  const match = block.match(/^\[\[object:(.+?)\]\]$/i);
  const rawKey = match?.[1]?.trim();
  if (!rawKey || !isWorkspaceObjectKey(rawKey)) return null;
  const kind = workspaceObjects[rawKey].kind;
  return kind === "graph3d" || kind === "tasks" || kind === "todo" || kind === "calendar" ? rawKey : null;
}
