import { useState } from "react";
import { useDialogDismiss } from "../hooks/useDialogDismiss";
import type {
  SourceDraft,
  SourcePrivacy,
  SourceTimeScope,
  SourceWikiPolicy,
} from "../types";

export function SourceModal({
  draft,
  onChange,
  onQueue,
  onClose,
}: {
  draft: SourceDraft;
  onChange: (draft: SourceDraft) => void;
  onQueue: () => void;
  onClose: () => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const dismiss = useDialogDismiss(onClose);

  return (
    <div
      className="source-modal-backdrop"
      onPointerDown={dismiss.onBackdropPointerDown}
    >
      <section
        className="source-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Add Source"
        ref={dismiss.containerRef}
      >
        <header className="source-modal-header">
          <span>Add Source File</span>
          <button type="button" onClick={onClose} aria-label="Close Add Source">
            Close
          </button>
        </header>
        <label className="source-file-drop">
          <span>Files</span>
          <input
            type="file"
            multiple
            aria-label="Source files"
            onChange={(event) =>
              onChange({
                ...draft,
                fileNames: Array.from(event.currentTarget.files ?? []).map(
                  (file) => file.name,
                ),
              })
            }
          />
        </label>
        {draft.fileNames.length > 0 && (
          <ul className="source-file-list" aria-label="Attached source files">
            {draft.fileNames.map((fileName) => (
              <li key={fileName}>{fileName}</li>
            ))}
          </ul>
        )}
        <button
          className="source-advanced-toggle"
          type="button"
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((open) => !open)}
        >
          Advanced
        </button>
        {advancedOpen && (
          <section
            className="source-advanced-options"
            aria-label="Advanced source options"
          >
            <input
              value={draft.title}
              onChange={(event) =>
                onChange({ ...draft, title: event.currentTarget.value })
              }
              placeholder="Source title"
              aria-label="Source title"
            />
            <label>
              <span>Media type</span>
              <select
                value={draft.mediaType}
                onChange={(event) =>
                  onChange({ ...draft, mediaType: event.currentTarget.value })
                }
              >
                <option value="text/markdown">Markdown</option>
                <option value="text/plain">Text</option>
                <option value="application/pdf">PDF</option>
                <option value="image/png">Image</option>
              </select>
            </label>
            <SegmentedSourceControl
              label="Privacy"
              value={draft.privacy}
              options={["public", "private"]}
              onChange={(value) =>
                onChange({ ...draft, privacy: value as SourcePrivacy })
              }
            />
            <SegmentedSourceControl
              label="Time scope"
              value={draft.timeScope}
              options={["permanent", "temporary"]}
              onChange={(value) =>
                onChange({ ...draft, timeScope: value as SourceTimeScope })
              }
            />
            <SegmentedSourceControl
              label="llm-wiki policy"
              value={draft.wikiPolicy}
              options={["never", "ask", "allowed"]}
              onChange={(value) =>
                onChange({ ...draft, wikiPolicy: value as SourceWikiPolicy })
              }
            />
          </section>
        )}
        <button
          className="source-primary-action"
          type="button"
          onClick={onQueue}
        >
          Queue Source
        </button>
      </section>
    </div>
  );
}

function SegmentedSourceControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="source-segmented-control">
      <legend>{label}</legend>
      {options.map((option) => (
        <button
          className={value === option ? "is-active" : ""}
          type="button"
          key={option}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </fieldset>
  );
}
