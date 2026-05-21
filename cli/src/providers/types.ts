export interface HealthStatus {
  ok: boolean;
  provider: string;
  kind: "embedding";
  message?: string;
  latencyMs?: number;
}

export interface ContainerSpec {
  name: string;
  runtime?: "podman" | "docker";
}
