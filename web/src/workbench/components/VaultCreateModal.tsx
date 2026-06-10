import { useState } from "react";
import { useDialogDismiss } from "../hooks/useDialogDismiss";

export type VaultBootstrapInput = {
  name: string;
  directory: string;
  sourceFolder: string | null;
  scaffold: boolean;
};

const vaultNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Vault onboarding dialog: name + location create the vault, an optional
 * existing folder is bulk-added as sources, and default template documents
 * can be scaffolded. Submission runs through the vault.bootstrap command.
 */
export function VaultCreateModal({
  hasBackend,
  onPickDirectory,
  onSubmit,
  onClose,
}: {
  hasBackend: boolean;
  onPickDirectory: (title: string) => Promise<string | null>;
  onSubmit: (input: VaultBootstrapInput) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [directory, setDirectory] = useState<string | null>(null);
  const [sourceFolder, setSourceFolder] = useState<string | null>(null);
  const [scaffold, setScaffold] = useState(true);
  const dismiss = useDialogDismiss(onClose);

  const nameValid = vaultNamePattern.test(name);
  const canSubmit = hasBackend && nameValid && directory !== null;

  return (
    <div
      className="vault-modal-backdrop"
      onPointerDown={dismiss.onBackdropPointerDown}
    >
      <section
        className="vault-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Create Vault"
        ref={dismiss.containerRef}
      >
        <header className="vault-modal-header">
          <span>Create Vault</span>
          <button type="button" onClick={onClose} aria-label="Close create vault">
            Close
          </button>
        </header>
        <p className="vault-modal-hint">
          {hasBackend
            ? "No active vault. Create one to store sources and artifacts."
            : "Backend bridge not detected — vault creation needs the Electron shell (npm run dev)."}
        </p>
        <label className="vault-modal-field">
          <span>Vault name</span>
          <input
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            placeholder="my-vault"
            aria-label="Vault name"
            autoFocus
          />
        </label>
        {name.length > 0 && !nameValid && (
          <p className="vault-modal-error">
            Names use letters, digits, dot, dash, and underscore.
          </p>
        )}
        <div className="vault-modal-field">
          <span>Location</span>
          <div className="vault-modal-path">
            <code>{directory ?? "No folder selected"}</code>
            <button
              type="button"
              onClick={async () => {
                const picked = await onPickDirectory("Choose vault location");
                if (picked) setDirectory(picked);
              }}
            >
              Choose...
            </button>
          </div>
        </div>
        <p className="vault-modal-hint">
          The vault is created at <code>&lt;location&gt;/&lt;name&gt;</code>.
        </p>
        <div className="vault-modal-field">
          <span>Import sources (optional)</span>
          <div className="vault-modal-path">
            <code>{sourceFolder ?? "No folder selected"}</code>
            <button
              type="button"
              onClick={async () => {
                const picked = await onPickDirectory(
                  "Choose a folder of markdown files to add as sources",
                );
                if (picked) setSourceFolder(picked);
              }}
            >
              Choose...
            </button>
            {sourceFolder && (
              <button type="button" onClick={() => setSourceFolder(null)}>
                Clear
              </button>
            )}
          </div>
        </div>
        <p className="vault-modal-hint">
          Markdown files in the folder are bulk-added as sources after the
          vault is created.
        </p>
        <label className="vault-modal-check">
          <input
            type="checkbox"
            checked={scaffold}
            onChange={(event) => setScaffold(event.currentTarget.checked)}
          />
          <span>
            Create default template documents (llm-wiki, calendar, todo,
            kanban)
          </span>
        </label>
        <button
          className="vault-modal-primary"
          type="button"
          disabled={!canSubmit}
          onClick={() =>
            directory &&
            onSubmit({ name, directory, sourceFolder, scaffold })
          }
        >
          Create Vault
        </button>
      </section>
    </div>
  );
}
