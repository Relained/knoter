import { Icon } from "../../shared/icons/Icon";
import type { VaultSummary } from "../../core/api/types";

/**
 * Always-visible vault status chip: vault name and document count when
 * connected, a warning otherwise. Clicking opens the vault status view
 * through the command registry.
 */
export function StatusChip({
  connected,
  vault,
  documentCount,
  onOpenStatus,
}: {
  connected: boolean;
  vault: VaultSummary | null;
  documentCount: number;
  onOpenStatus: () => void;
}) {
  const warning = !connected || !vault;
  const text = !connected
    ? "No backend"
    : vault
      ? `${vault.name} · ${documentCount} docs`
      : "No active vault";

  return (
    <button
      className={`workbench-status-chip ${warning ? "is-warning" : ""}`}
      type="button"
      title={
        connected
          ? "Open vault status"
          : "Backend bridge not detected — running on local fixtures"
      }
      onClick={onOpenStatus}
    >
      <Icon name={warning ? "status.warning" : "status.vault"} size={13} />
      <span>{text}</span>
    </button>
  );
}
