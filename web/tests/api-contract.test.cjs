const assert = require("node:assert/strict");
const test = require("node:test");

const { mockKnotenApi } = require("../.test-build/api/index.js");
const { createIpcKnotenApi } = require("../.test-build/preload/knoterApi.js");

test("mock API filters explorer items by layer and query", async () => {
  const templateItems = await mockKnotenApi.explorer.list({
    layers: ["template"],
    query: "dashboard"
  });
  const sourceItems = await mockKnotenApi.explorer.list({
    layers: ["source"],
    query: "dashboard"
  });

  assert.deepEqual(templateItems.map((item) => item.title), ["Dashboard"]);
  assert.deepEqual(sourceItems, []);
});

test("mock API exposes graph payload and refresh metadata", async () => {
  const graph = await mockKnotenApi.graph.get({ includeChunks: true });
  const refresh = await mockKnotenApi.graph.refresh();

  assert.equal(graph.vaultId, "mock");
  assert.equal(graph.nodes.length, 2);
  assert.equal(refresh.nodeCount, graph.nodes.length);
  assert.equal(refresh.edgeCount, graph.edges.length);
});

test("IPC API adapter maps typed client calls to channels", async () => {
  const calls = [];
  const api = createIpcKnotenApi(async (channel, input) => {
    calls.push({ channel, input });
    if (channel === "vault:getActive") return null;
    if (channel === "vault:switch") return { id: input.vaultId, name: input.vaultId, root: ".", active: true };
    if (channel === "explorer:list") return [];
    if (channel === "explorer:refresh") return { vaultId: "work", itemCount: 0, refreshedAt: "now", cachePath: null };
    if (channel === "graph:get") return { vaultId: "work", generatedAt: "now", nodes: [], edges: [] };
    if (channel === "graph:refresh") return { vaultId: "work", nodeCount: 0, edgeCount: 0, refreshedAt: "now", cachePath: null };
    if (channel === "search:query") return [];
    throw new Error(`Unexpected channel ${channel}`);
  });

  await api.vault.getActive();
  await api.vault.switch("work");
  await api.explorer.list({ layers: ["template"] });
  await api.graph.get({ includeChunks: true });
  await api.search.query({ query: "daily", mode: "hybrid" });

  assert.deepEqual(calls.map((call) => call.channel), [
    "vault:getActive",
    "vault:switch",
    "explorer:list",
    "graph:get",
    "search:query"
  ]);
  assert.deepEqual(calls[2].input, { layers: ["template"] });
});
