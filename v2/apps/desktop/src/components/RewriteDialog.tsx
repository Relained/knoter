import { useEffect, useState } from 'react';
import { Scale } from 'lucide-react';
import type { WikiDocument } from '@knoter/contracts';
import { DEFAULT_SUPPLEMENT_RATIO } from '@knoter/contracts/native';
import { Button } from './ui/button';
import { Dialog } from './ui/dialog';

const presets = [10, 30, 50, 70];

/** A slider for the share of marked supplements, shown against the user's own notes. */
export function RatioField({
  value,
  onChange,
  label = 'Supplement ratio',
}: {
  value: number;
  onChange: (value: number) => void;
  label?: string;
}) {
  return (
    <div className="ratio-field">
      <div className="ratio-heading">
        <label htmlFor="supplement-ratio">{label}</label>
        <span>
          {value}%{value === DEFAULT_SUPPLEMENT_RATIO ? ' · default' : ''}
        </span>
      </div>
      <div className="ratio-bar" aria-hidden="true">
        <span className="ratio-own" style={{ flexGrow: 100 - value }}>
          Your notes {100 - value}%
        </span>
        <span className="ratio-supplement" style={{ flexGrow: Math.max(value, 0.001) }}>
          {value >= 18 ? `Supplements ${value}%` : ''}
        </span>
      </div>
      <input
        id="supplement-ratio"
        type="range"
        min={0}
        max={90}
        step={5}
        value={value}
        aria-valuetext={`${100 - value}% your notes, ${value}% supplements`}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="ratio-presets">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            className={value === preset ? 'selected' : ''}
            onClick={() => onChange(preset)}
          >
            {preset}%
          </button>
        ))}
      </div>
    </div>
  );
}

/** The chat request that asks the agent to rebalance one page. */
export function rewriteRequest(doc: WikiDocument, ratio: number) {
  const label = doc.title.replace(/[|[\]]/g, ' ').trim();
  return `[[${doc.id}|${label}]] 문서를 원본 ${100 - ratio}% · 보충 ${ratio}% 비율로 다시 작성해 주세요. 내가 쓴 노트 내용은 모두 유지하고, **보충** 표시된 설명의 분량과 깊이를 이 비율에 맞춰 조정해 주세요.`;
}

export function RewriteDialog({
  doc,
  defaultRatio,
  simulated,
  onClose,
  onRewrite,
}: {
  doc: WikiDocument | null;
  defaultRatio: number;
  simulated: boolean;
  onClose: () => void;
  onRewrite: (doc: WikiDocument, ratio: number, remember: boolean) => void;
}) {
  const [ratio, setRatio] = useState(defaultRatio);
  const [remember, setRemember] = useState(false);
  // Reset per opened note; snapshot polling replaces the document object every few seconds.
  const docId = doc?.id;
  useEffect(() => {
    if (docId) {
      setRatio(defaultRatio);
      setRemember(false);
    }
  }, [docId, defaultRatio]);
  return (
    <Dialog
      open={!!doc}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Rewrite with a supplement ratio"
      description="Keep everything you wrote and change how much the marked supplements (보충) explain."
      className="rewrite-dialog"
    >
      {doc && (
        <div className="dialog-form">
          <div className="rewrite-target">
            <Scale size={16} />
            <strong>{doc.title}</strong>
          </div>
          <RatioField value={ratio} onChange={setRatio} />
          <p className="ratio-hint">
            Higher values ask for fuller supplements: definitions, background, how it works,
            examples, and comparisons, each backed by references. Your own notes are never
            shortened. The rewrite runs in Chat and is saved as a revision you can restore.
            {doc.protected
              ? ' You edited this note; it changes only because you ask for it here.'
              : ''}
          </p>
          {simulated && (
            <p className="ratio-hint">
              The browser preview simulates the reply and changes no notes.
            </p>
          )}
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Also use {ratio}% for new pages
          </label>
          <div className="dialog-actions">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => onRewrite(doc, ratio, remember)}>
              <Scale /> Rewrite note
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
