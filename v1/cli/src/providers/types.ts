export interface HealthStatus {
  ok: boolean;
  provider: string;
  kind: "embedding";
  message?: string;
  latencyMs?: number;
}
