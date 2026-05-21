import type { CSSProperties } from "react";
import type { Graph3DFilterKey, WorkspaceObjectKind, WorkspaceObjectState } from "../domain/types";
import { getSelectedGraph3DFilters, graph3dFilterLabels, normalizeGraph3DFilters } from "../graph3d/model";

type ObjectTemplateRendererProps = {
  kind: Exclude<WorkspaceObjectKind, "note" | "settings">;
  objectState: WorkspaceObjectState | null;
};

const objectTemplates = {
  graph3d: {
    title: "Graph 3D",
    summary: "A linked-object graph surface prepared for a 3D engine-backed renderer.",
    primary: ["Notes", "Tasks", "Events"],
    secondary: ["Notes -> Tasks", "Tasks -> Events", "Events -> Notes"]
  },
  tasks: {
    title: "Tasks",
    summary: "A task board template for grouped work items, priorities, and review lanes.",
    primary: ["Backlog", "In Progress", "Review"],
    secondary: ["Blocked", "Due Soon", "Done"]
  },
  todo: {
    title: "Todo",
    summary: "A compact checklist template for short-lived personal action items.",
    primary: ["Inbox", "Today", "Next"],
    secondary: ["Waiting", "Recurring", "Done"]
  },
  calendar: {
    title: "Calendar",
    summary: "A calendar template for time-based objects and scheduled notes.",
    primary: ["Mon", "Tue", "Wed", "Thu"],
    secondary: ["Fri", "Sat", "Sun"]
  }
} satisfies Record<Exclude<WorkspaceObjectKind, "note" | "settings">, {
  title: string;
  summary: string;
  primary: string[];
  secondary: string[];
}>;

export function ObjectTemplateRenderer({ kind, objectState }: ObjectTemplateRendererProps) {
  const template = objectTemplates[kind];
  const labels = getObjectLabels(kind, objectState);

  return (
    <article className={`viewer object-template object-template-${kind}`} tabIndex={0}>
      <header className="object-template-header">
        <h1>{template.title}</h1>
        <p>{template.summary}</p>
      </header>

      <div className="object-template-surface" aria-hidden="true">
        <div className="object-template-primary">
          {labels.primary.map((label, index) => (
            <span
              key={`${label}-${index}`}
              style={{
                "--object-index": index,
                "--object-row": index % 2
              } as CSSProperties}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="object-template-secondary">
          {labels.secondary.map((label, index) => (
            <span key={`${label}-${index}`}>{label}</span>
          ))}
        </div>
      </div>
    </article>
  );
}

function getObjectLabels(
  kind: Exclude<WorkspaceObjectKind, "note" | "settings">,
  objectState: WorkspaceObjectState | null
) {
  const template = objectTemplates[kind];
  if (!objectState || objectState.kind !== kind) return template;

  switch (objectState.kind) {
    case "graph3d":
      return getGraph3DLabels(objectState, template);
    case "tasks":
      return {
        ...template,
        primary: objectState.lanes.map((lane) => lane.title),
        secondary: objectState.lanes.map((lane) => `${lane.items.length} item${lane.items.length === 1 ? "" : "s"}`)
      };
    case "todo": {
      const openCount = objectState.items.filter((item) => !item.done).length;
      const doneCount = objectState.items.length - openCount;
      return {
        ...template,
        primary: objectState.items.slice(0, 4).map((item) => item.text),
        secondary: [`${openCount} open`, `${doneCount} done`]
      };
    }
    case "calendar":
      return {
        ...template,
        primary: objectState.events.map((event) => event.title),
        secondary: objectState.events.map((event) => event.date)
      };
  }
}

function getGraph3DLabels(
  objectState: Extract<WorkspaceObjectState, { kind: "graph3d" }>,
  template: { primary: string[]; secondary: string[] }
) {
  const selectedFilters = getSelectedGraph3DFilters(normalizeGraph3DFilters(objectState.filters));
  if (selectedFilters.length === 0) {
    return {
      ...template,
      primary: ["No filters selected"],
      secondary: ["Source, rewritten, and template are hidden"]
    };
  }

  return {
    ...template,
    primary: selectedFilters.map((filterKey) => graph3dFilterLabels[filterKey]),
    secondary: selectedFilters.flatMap((filterKey) => createGraph3DLayerLabels(filterKey, objectState))
  };
}

function createGraph3DLayerLabels(filterKey: Graph3DFilterKey, objectState: Extract<WorkspaceObjectState, { kind: "graph3d" }>) {
  const prefix = graph3dFilterLabels[filterKey];
  const node = objectState.nodes[0] ?? "Nodes";
  const link = objectState.links[0] ?? "Links";
  return [`${prefix}: ${node}`, `${prefix}: ${link}`];
}
