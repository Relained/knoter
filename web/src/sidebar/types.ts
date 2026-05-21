import type { SidebarExplorerFilters } from "../domain/types";

export type SidebarSurfaceKey = "explorer" | "search" | "graph" | "tasks" | "settings";

export type SidebarState = {
  activeSurface: SidebarSurfaceKey;
  explorer: {
    filters: SidebarExplorerFilters;
    query: string;
  };
  search: {
    query: string;
    mode: "keyword" | "semantic" | "hybrid";
  };
};

export const sidebarSurfaceLabels: Record<SidebarSurfaceKey, string> = {
  explorer: "Explorer",
  search: "Search",
  graph: "Graph",
  tasks: "Tasks",
  settings: "Settings"
};

export const sidebarSurfaceKeys = ["explorer", "search", "graph", "tasks", "settings"] as const;
