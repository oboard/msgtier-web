<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { apiData, apiUrl } from "../stores/data";
import type { ConfigResponse, Peer, PortForwardMeta } from "../types/api";

interface ForwardView {
  owner: Peer;
  targetPeer: Peer | null;
  rule: PortForwardMeta;
}

interface ExposeView {
  owner: Peer;
  rule: PortForwardMeta;
}

interface ForwardRow {
  peerId: string;
  ruleId: string;
  spec: string;
}

interface ExposeRow {
  ruleId: string;
  spec: string;
}

const peers = computed(() => apiData.value?.peers ?? []);
const selectedNodeId = ref("");
const authSecret = ref("");
const editorLoading = ref(false);
const editorError = ref<string | null>(null);
const editorSuccess = ref<string | null>(null);
const forwardRows = reactive<ForwardRow[]>([]);
const exposeRows = reactive<ExposeRow[]>([]);

const nodeOptions = computed(() =>
  peers.value
    .map((peer) => ({ id: peer.id, self: peer.id === apiData.value?.peer_id }))
    .sort((a, b) => a.id.localeCompare(b.id)),
);

const forwardViews = computed<ForwardView[]>(() =>
  peers.value.flatMap((owner) => {
    const rules = Array.isArray(owner.metadata?.port_forwards)
      ? owner.metadata.port_forwards
      : [];
    return rules
      .filter((rule) => rule.direction === "forward")
      .map((rule) => ({
        owner,
        targetPeer: peers.value.find((peer) => peer.id === rule.peer_id) ?? null,
        rule,
      }));
  }),
);

const exposeViews = computed<ExposeView[]>(() =>
  peers.value.flatMap((owner) => {
    const rules = Array.isArray(owner.metadata?.port_forwards)
      ? owner.metadata.port_forwards
      : [];
    return rules
      .filter((rule) => rule.direction === "expose")
      .map((rule) => ({ owner, rule }));
  }),
);

const activeCount = computed(
  () => forwardViews.value.filter(({ rule }) => rule.state === "listening").length,
);

watch(
  () => [apiData.value?.peer_id, nodeOptions.value.map((item) => item.id).join(",")],
  () => {
    if (!selectedNodeId.value) {
      selectedNodeId.value = apiData.value?.peer_id ?? "";
    } else if (!nodeOptions.value.some((item) => item.id === selectedNodeId.value)) {
      selectedNodeId.value = apiData.value?.peer_id ?? "";
    }
  },
  { immediate: true },
);

watch(
  () => selectedNodeId.value,
  (peerId) => {
    if (!peerId) {
      return;
    }
    void loadEditorConfig(peerId);
  },
  { immediate: true },
);

function resetRows(): void {
  forwardRows.splice(0, forwardRows.length);
  exposeRows.splice(0, exposeRows.length);
}

function formatForwardRows(forwards: Record<string, string> | null | undefined): void {
  const entries = Object.entries(forwards ?? {}).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) {
    forwardRows.push({ peerId: "", ruleId: "", spec: "" });
    return;
  }
  for (const [key, spec] of entries) {
    const [peerId = "", ruleId = ""] = key.split(":", 2);
    forwardRows.push({ peerId, ruleId, spec });
  }
}

function formatExposeRows(exposes: Record<string, string> | null | undefined): void {
  const entries = Object.entries(exposes ?? {}).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) {
    exposeRows.push({ ruleId: "", spec: "" });
    return;
  }
  for (const [ruleId, spec] of entries) {
    exposeRows.push({ ruleId, spec });
  }
}

function hydrateEditor(config: ConfigResponse): void {
  resetRows();
  formatForwardRows(config.hot_config?.forwards);
  formatExposeRows(config.hot_config?.exposes);
}

function buildConfigUrl(peerId: string, path: string): string {
  const localPeerId = apiData.value?.peer_id;
  const localPath = path.startsWith("/api/") ? path.slice(4) : path;
  if (!localPeerId || peerId === localPeerId) {
    return `${apiUrl.value}${localPath}`;
  }
  const query = new URLSearchParams({ peer: peerId, path });
  return `${apiUrl.value}/proxy?${query.toString()}`;
}

async function loadEditorConfig(peerId: string): Promise<void> {
  editorLoading.value = true;
  editorError.value = null;
  editorSuccess.value = null;
  try {
    const response = await fetch(buildConfigUrl(peerId, "/api/config"));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const config = (await response.json()) as ConfigResponse;
    hydrateEditor(config);
  } catch (error) {
    resetRows();
    editorError.value = error instanceof Error ? error.message : "Failed to load config";
  } finally {
    editorLoading.value = false;
  }
}

function addForwardRow(): void {
  forwardRows.push({ peerId: "", ruleId: "", spec: "" });
}

function addExposeRow(): void {
  exposeRows.push({ ruleId: "", spec: "" });
}

function removeForwardRow(index: number): void {
  forwardRows.splice(index, 1);
  if (forwardRows.length === 0) {
    addForwardRow();
  }
}

function removeExposeRow(index: number): void {
  exposeRows.splice(index, 1);
  if (exposeRows.length === 0) {
    addExposeRow();
  }
}

function buildForwardMap(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of forwardRows) {
    const peerId = row.peerId.trim();
    const ruleId = row.ruleId.trim();
    const spec = row.spec.trim();
    if (!peerId && !ruleId && !spec) {
      continue;
    }
    if (!peerId || !ruleId || !spec) {
      throw new Error("Each forward row requires peer, rule id, and listen spec");
    }
    result[`${peerId}:${ruleId}`] = spec;
  }
  return result;
}

function buildExposeMap(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of exposeRows) {
    const ruleId = row.ruleId.trim();
    const spec = row.spec.trim();
    if (!ruleId && !spec) {
      continue;
    }
    if (!ruleId || !spec) {
      throw new Error("Each expose row requires rule id and target spec");
    }
    result[ruleId] = spec;
  }
  return result;
}

async function saveMappings(): Promise<void> {
  if (!selectedNodeId.value) {
    return;
  }

  editorLoading.value = true;
  editorError.value = null;
  editorSuccess.value = null;
  try {
    const response = await fetch(buildConfigUrl(selectedNodeId.value, "/api/config/hot-reload"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        secret: authSecret.value.trim() || undefined,
        config: {
          forwards: buildForwardMap(),
          exposes: buildExposeMap(),
        },
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload && typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`;
      throw new Error(message);
    }
    const config = payload as ConfigResponse;
    hydrateEditor(config);
    editorSuccess.value = `Updated mappings for ${selectedNodeId.value}`;
  } catch (error) {
    editorError.value = error instanceof Error ? error.message : "Failed to save mappings";
  } finally {
    editorLoading.value = false;
  }
}

function getStateBadgeClass(state: string): string {
  switch (state) {
    case "listening":
      return "badge-success";
    case "matched":
    case "configured":
      return "badge-info";
    case "disabled":
      return "badge-ghost";
    case "peer_unavailable":
    case "target_connect_failed":
    case "rejected":
    case "protocol_mismatch":
      return "badge-warning";
    default:
      return "badge-outline";
  }
}

function formatListen(rule: PortForwardMeta): string {
  if (!rule.listen_port) {
    return "unbound";
  }
  return `${rule.listen_host || "127.0.0.1"}:${rule.listen_port}`;
}

function formatExposeSummary(rule: PortForwardMeta): string {
  return `${rule.protocol.toUpperCase()} / ${rule.id}`;
}
</script>

<template>
  <div class="card bg-base-100 border border-base-300 rounded-box">
    <div class="card-body gap-5">
      <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 class="card-title text-base">Port Mapping</h3>
          <p class="text-xs text-base-content/60">
            Visual tunnel lanes plus inline editing for `forwards` and `exposes`.
          </p>
        </div>
        <div class="flex gap-2">
          <div class="badge badge-outline">
            {{ forwardViews.length }} forwards
          </div>
          <div class="badge badge-outline">
            {{ activeCount }} active
          </div>
        </div>
      </div>

      <div v-if="forwardViews.length === 0 && exposeViews.length === 0" class="alert alert-info text-sm">
        No port forwarding metadata discovered.
      </div>

      <div v-else class="space-y-6">
        <section v-if="forwardViews.length > 0" class="space-y-3">
          <div class="flex items-center justify-between">
            <h4 class="text-sm font-semibold uppercase tracking-[0.18em] text-base-content/55">
              Forward Lanes
            </h4>
            <span class="text-xs text-base-content/50">
              listen -> peer -> rule
            </span>
          </div>

          <div class="space-y-3">
            <div
              v-for="{ owner, targetPeer, rule } in forwardViews"
              :key="`${owner.id}:${rule.id}:${rule.protocol}:${rule.peer_id}`"
              class="rounded-box border border-base-300 bg-base-200/45 p-4"
            >
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="text-xs uppercase tracking-[0.18em] text-base-content/45">
                    {{ rule.protocol }}
                  </div>
                  <div class="mt-1 text-sm font-semibold">
                    {{ owner.id }} / {{ rule.id }}
                  </div>
                </div>
                <div class="badge badge-sm" :class="getStateBadgeClass(rule.state)">
                  {{ rule.state }}
                </div>
              </div>

              <div class="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,0.9fr)_auto_minmax(0,0.9fr)] md:items-center">
                <div class="rounded-xl border border-primary/20 bg-primary/8 px-4 py-3">
                  <div class="text-[11px] uppercase tracking-[0.18em] text-base-content/45">Local listener</div>
                  <div class="mt-1 font-mono text-sm break-all">{{ formatListen(rule) }}</div>
                  <div class="mt-2 text-xs text-base-content/60">Owner {{ owner.id }}</div>
                </div>

                <div class="hidden md:flex items-center justify-center text-base-content/35 text-lg">
                  →
                </div>

                <div class="rounded-xl border border-secondary/20 bg-secondary/8 px-4 py-3">
                  <div class="text-[11px] uppercase tracking-[0.18em] text-base-content/45">Remote peer</div>
                  <div class="mt-1 font-mono text-sm break-all">{{ rule.peer_id || "-" }}</div>
                  <div class="mt-2 text-xs text-base-content/60">
                    {{ targetPeer ? `${targetPeer.addresses.length} known addresses` : "Peer metadata unavailable" }}
                  </div>
                </div>

                <div class="hidden md:flex items-center justify-center text-base-content/35 text-lg">
                  →
                </div>

                <div class="rounded-xl border border-accent/20 bg-accent/8 px-4 py-3">
                  <div class="text-[11px] uppercase tracking-[0.18em] text-base-content/45">Remote expose</div>
                  <div class="mt-1 font-mono text-sm break-all">{{ rule.id }}</div>
                  <div class="mt-2 text-xs text-base-content/60">
                    Matched by rule key on {{ rule.peer_id || "target peer" }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section v-if="exposeViews.length > 0" class="space-y-3">
          <div class="flex items-center justify-between">
            <h4 class="text-sm font-semibold uppercase tracking-[0.18em] text-base-content/55">
              Expose Docks
            </h4>
            <span class="text-xs text-base-content/50">
              published targets available to matching forwards
            </span>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <div
              v-for="{ owner, rule } in exposeViews"
              :key="`${owner.id}:${rule.id}:${rule.protocol}`"
              class="rounded-box border border-base-300 bg-base-200/35 p-4"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <div class="text-xs uppercase tracking-[0.18em] text-base-content/45">
                    {{ owner.id }}
                  </div>
                  <div class="mt-1 text-sm font-semibold">
                    {{ formatExposeSummary(rule) }}
                  </div>
                </div>
                <div class="badge badge-sm" :class="getStateBadgeClass(rule.state)">
                  {{ rule.state }}
                </div>
              </div>

              <div class="mt-4 rounded-xl border border-base-300 bg-base-100 px-4 py-3">
                <div class="text-[11px] uppercase tracking-[0.18em] text-base-content/45">Expose slot</div>
                <div class="mt-1 font-mono text-sm break-all">{{ rule.id }}</div>
                <div class="mt-2 text-xs text-base-content/60">
                  Waiting for a matching forward on another node.
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div class="divider my-1"></div>

      <section class="space-y-4">
        <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h4 class="text-sm font-semibold uppercase tracking-[0.18em] text-base-content/55">
              Edit Mapping
            </h4>
            <p class="text-xs text-base-content/60">
              Save `forwards` and `exposes` for a selected node using the hot reload API.
            </p>
          </div>
          <div class="grid gap-3 md:grid-cols-2">
            <label class="form-control">
              <span class="label-text text-xs uppercase tracking-[0.18em] text-base-content/50">Node</span>
              <select v-model="selectedNodeId" class="select select-bordered select-sm min-w-48">
                <option v-for="item in nodeOptions" :key="item.id" :value="item.id">
                  {{ item.id }}{{ item.self ? " (local)" : "" }}
                </option>
              </select>
            </label>
            <label class="form-control">
              <span class="label-text text-xs uppercase tracking-[0.18em] text-base-content/50">Request secret</span>
              <input
                v-model="authSecret"
                type="password"
                class="input input-bordered input-sm min-w-48"
                placeholder="Optional hot_reload secret"
              />
            </label>
          </div>
        </div>

        <div v-if="editorError" class="alert alert-error text-sm">
          {{ editorError }}
        </div>
        <div v-if="editorSuccess" class="alert alert-success text-sm">
          {{ editorSuccess }}
        </div>

        <div class="grid gap-5 xl:grid-cols-2">
          <div class="space-y-3 rounded-box border border-base-300 bg-base-200/35 p-4">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-sm font-semibold">Forwards</div>
                <div class="text-xs text-base-content/60">`peer_id:rule_id` -> `protocol://listen_host:listen_port`</div>
              </div>
              <button class="btn btn-xs btn-outline" type="button" @click="addForwardRow">Add</button>
            </div>

            <div class="space-y-3">
              <div
                v-for="(row, index) in forwardRows"
                :key="`forward-${index}`"
                class="grid gap-2 rounded-xl border border-base-300 bg-base-100 p-3"
              >
                <div class="grid gap-2 md:grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.4fr)_auto]">
                  <input v-model="row.peerId" class="input input-bordered input-sm" placeholder="peer id" />
                  <input v-model="row.ruleId" class="input input-bordered input-sm" placeholder="rule id" />
                  <input
                    v-model="row.spec"
                    class="input input-bordered input-sm font-mono"
                    placeholder="tcp://127.0.0.1:10022"
                  />
                  <button class="btn btn-sm btn-ghost" type="button" @click="removeForwardRow(index)">Remove</button>
                </div>
              </div>
            </div>
          </div>

          <div class="space-y-3 rounded-box border border-base-300 bg-base-200/35 p-4">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-sm font-semibold">Exposes</div>
                <div class="text-xs text-base-content/60">`rule_id` -> `protocol://target_host:target_port`</div>
              </div>
              <button class="btn btn-xs btn-outline" type="button" @click="addExposeRow">Add</button>
            </div>

            <div class="space-y-3">
              <div
                v-for="(row, index) in exposeRows"
                :key="`expose-${index}`"
                class="grid gap-2 rounded-xl border border-base-300 bg-base-100 p-3"
              >
                <div class="grid gap-2 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)_auto]">
                  <input v-model="row.ruleId" class="input input-bordered input-sm" placeholder="rule id" />
                  <input
                    v-model="row.spec"
                    class="input input-bordered input-sm font-mono"
                    placeholder="tcp://127.0.0.1:22"
                  />
                  <button class="btn btn-sm btn-ghost" type="button" @click="removeExposeRow(index)">Remove</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-3">
          <button class="btn btn-ghost" type="button" :disabled="editorLoading || !selectedNodeId" @click="selectedNodeId && loadEditorConfig(selectedNodeId)">
            Reload
          </button>
          <button class="btn btn-primary" type="button" :disabled="editorLoading || !selectedNodeId" @click="saveMappings">
            <span v-if="editorLoading" class="loading loading-spinner loading-sm"></span>
            Save mapping
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
