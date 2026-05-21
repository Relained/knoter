import type { CSSProperties } from "react";
import type { TabPlacementPreviewModel } from "../domain/types";

type PreviewStyle = CSSProperties & {
  "--preview-left": string;
  "--preview-top": string;
  "--preview-width": string;
  "--preview-height": string;
};

export function TabPlacementPreview({ preview }: { preview: TabPlacementPreviewModel }) {
  const { rect, position } = preview;
  const isSelfTabPreview = preview.mode === "tab" && preview.sourceTabId === preview.targetTabId;
  const style: PreviewStyle = {
    "--preview-left": `${rect.left}px`,
    "--preview-top": `${rect.top}px`,
    "--preview-width": `${rect.width}px`,
    "--preview-height": `${rect.height}px`
  };

  return (
    <div
      className={[
        "tab-placement-preview",
        `tab-placement-preview-${preview.mode}`,
        `tab-placement-preview-${position}`,
        isSelfTabPreview ? "tab-placement-preview-self" : ""
      ].filter(Boolean).join(" ")}
      style={style}
      aria-hidden="true"
    >
      <span className="tab-placement-zone" />
    </div>
  );
}
