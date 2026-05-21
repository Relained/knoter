import type { CSSProperties } from "react";
import type { EdgePreviewModel } from "../domain/types";

type PreviewStyle = CSSProperties & {
  "--preview-left": string;
  "--preview-top": string;
  "--preview-width": string;
  "--preview-height": string;
};

export function EdgePreview({ preview }: { preview: EdgePreviewModel }) {
  const { rect, position } = preview;
  const style: PreviewStyle = {
    "--preview-left": `${rect.left}px`,
    "--preview-top": `${rect.top}px`,
    "--preview-width": `${rect.width}px`,
    "--preview-height": `${rect.height}px`
  };

  return (
    <div
      className={`edge-preview edge-preview-${position}`}
      style={style}
      aria-hidden="true"
    >
      <span className="edge-preview-bar" />
    </div>
  );
}
