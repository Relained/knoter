import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';

export interface EditorHandle {
  getMarkdown: () => string;
}

export default function Editor({
  value,
  onChange,
  ref,
}: {
  value: string;
  onChange: (value: string) => void;
  ref?: Ref<EditorHandle>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const activeEditor = useRef<Crepe | null>(null);
  const initial = useRef(value);
  const change = useRef(onChange);
  const [failed, setFailed] = useState(false);
  change.current = onChange;
  // Milkdown change notifications are debounced; saving must read the live document.
  useImperativeHandle(
    ref,
    () => ({ getMarkdown: () => activeEditor.current?.getMarkdown() ?? value }),
    [value],
  );
  useEffect(() => {
    if (!host.current) return;
    let disposed = false;
    const crepe = new Crepe({
      root: host.current,
      defaultValue: initial.current,
      features: { [Crepe.Feature.ImageBlock]: false, [Crepe.Feature.Latex]: false },
    });
    crepe.on((listener) =>
      listener.markdownUpdated((_ctx, markdown) => {
        if (!disposed) change.current(markdown);
      }),
    );
    const created = crepe.create();
    void created
      .then(() => {
        if (!disposed) activeEditor.current = crepe;
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      activeEditor.current = null;
      void created.then(() => crepe.destroy()).catch(() => {});
    };
  }, []);
  return failed ? (
    <textarea
      className="markdown-fallback"
      aria-label="Markdown editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ) : (
    <div className="wiki-editor" ref={host} />
  );
}
