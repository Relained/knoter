import { ObjectTemplateRenderer } from "./ObjectTemplateRenderer";
import type { WorkspaceObjectRendererProps } from "./types";

export function Graph3DObjectRenderer({ objectState }: WorkspaceObjectRendererProps) {
  return <ObjectTemplateRenderer kind="graph3d" objectState={objectState} />;
}
