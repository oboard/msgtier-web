<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { apiData, apiUrl } from "../stores/data";
import type {
  LocalPortEntry,
  PortMappingRule,
  PortScanLocalResponse,
  PortScanPeersResponse,
  PortMappingsResponse,
} from "../types/api";

interface PeerPortView {
  peerId: string;
  lastUpdated: string;
  ports: LocalPortEntry[];
}

interface PullDraft {
  peerId: string;
  remoteProtocol: string;
  remoteHost: string;
  remotePort: number;
  suggestedLabel: string;
  localHost: string;
  localPort: string;
  note: string;
}

const localPorts = ref<LocalPortEntry[]>([]);
const peerPorts = ref<PeerPortView[]>([]);
const mappings = ref<PortMappingRule[]>([]);

const loadingScan = ref(false);
const loadingPeers = ref(false);
const loadingMappings = ref(false);
const refreshing = ref(false);
const scanError = ref<string | null>(null);
const peersError = ref<string | null>(null);
const mappingsError = ref<string | null>(null);
const createError = ref<string | null>(null);
const createSuccess = ref<string | null>(null);

const showPullDialog = ref(false);
const pullDraft = reactive<PullDraft>(emptyDraft());
let pollTimer: number | null = null;

function emptyDraft(): PullDraft {
  return {
    peerId: "",
    remoteProtocol: "tcp",
    remoteHost: "127.0.0.1",
    remotePort: 0,
    suggestedLabel: "",
    localHost: "0.0.0.0",
    localPort: "",
    note: "",
  };
}

const selfPeerId = computed(() => apiData.value?.peer_id ?? "");

const peerCount = computed(() => peerPorts.value.length);
const totalPeerPorts = computed(() =>
  peerPorts.value.reduce((total, p) => total + p.ports.length, 0),
);
const activeMappingCount = computed(
  () => mappings.value.filter((m) => m.enabled).length,
);

async function loadAll(): Promise<void> {
  await Promise.all([loadLocalScan(), loadPeerScan(), loadMappings()]);
}

async function loadLocalScan(): Promise<void> {
  loadingScan.value = true;
  scanError.value = null;
  try {
    const response = await fetch(`${apiUrl.value}/port_scan/local`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as PortScanLocalResponse;
    localPorts.value = Array.isArray(data.ports) ? data.ports : [];
  } catch (error) {
    localPorts.value = [];
    scanError.value = error instanceof Error ? error.message : "Failed to load local scan";
  } finally {
    loadingScan.value = false;
  }
}

async function loadPeerScan(): Promise<void> {
  loadingPeers.value = true;
  peersError.value = null;
  try {
    const response = await fetch(`${apiUrl.value}/port_scan/peers`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as PortScanPeersResponse;
    const rows: PeerPortView[] = [];
    for (const [peerId, entry] of Object.entries(data.peers ?? {})) {
      rows.push({
        peerId,
        lastUpdated: entry.last_updated ?? "0",
        ports: Array.isArray(entry.ports) ? entry.ports : [],
      });
    }
    rows.sort((a, b) => a.peerId.localeCompare(b.peerId));
    peerPorts.value = rows;
  } catch (error) {
    peerPorts.value = [];
    peersError.value = error instanceof Error ? error.message : "Failed to load peer scan";
  } finally {
    loadingPeers.value = false;
  }
}

async function loadMappings(): Promise<void> {
  loadingMappings.value = true;
  mappingsError.value = null;
  try {
    const response = await fetch(`${apiUrl.value}/port_mappings`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as PortMappingsResponse;
    mappings.value = Array.isArray(data.mappings) ? data.mappings : [];
  } catch (error) {
    mappings.value = [];
    mappingsError.value = error instanceof Error ? error.message : "Failed to load mappings";
  } finally {
    loadingMappings.value = false;
  }
}

async function refreshScan(): Promise<void> {
  refreshing.value = true;
  scanError.value = null;
  try {
    const response = await fetch(`${apiUrl.value}/port_scan/refresh`, {
      method: "POST",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await Promise.all([loadLocalScan(), loadPeerScan()]);
  } catch (error) {
    scanError.value = error instanceof Error ? error.message : "Failed to refresh scan";
  } finally {
    refreshing.value = false;
  }
}

function openPullDialog(peerId: string, entry: LocalPortEntry): void {
  Object.assign(pullDraft, emptyDraft(), {
    peerId,
    remoteProtocol: entry.protocol,
    remoteHost: entry.bind_addr === "*" || entry.bind_addr === "0.0.0.0" || entry.bind_addr === "::"
      ? "127.0.0.1"
      : entry.bind_addr,
    remotePort: entry.port,
    suggestedLabel: entry.process_name ?? `${entry.protocol}/${entry.port}`,
    localHost: "127.0.0.1",
    localPort: "",
    note: "",
  });
  createError.value = null;
  createSuccess.value = null;
  showPullDialog.value = true;
}

function closePullDialog(): void {
  showPullDialog.value = false;
  createError.value = null;
}

async function submitPull(): Promise<void> {
  createError.value = null;
  createSuccess.value = null;
  const body: Record<string, unknown> = {
    peer_id: pullDraft.peerId,
    remote_protocol: pullDraft.remoteProtocol,
    remote_host: pullDraft.remoteHost,
    remote_port: pullDraft.remotePort,
    local_host: pullDraft.localHost.trim() || "127.0.0.1",
  };
  const localPortRaw = pullDraft.localPort.trim();
  if (localPortRaw) {
    const parsed = Number(localPortRaw);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
      createError.value = "Local port must be between 1 and 65535";
      return;
    }
    body.local_port = parsed;
  }
  if (pullDraft.note.trim()) {
    body.note = pullDraft.note.trim();
  }
  try {
    const response = await fetch(`${apiUrl.value}/port_mappings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload && typeof payload.message === "string"
        ? payload.message
        : payload && typeof payload.error === "string"
          ? payload.error
          : `HTTP ${response.status}`;
      throw new Error(message);
    }
    createSuccess.value = `Mapped ${pullDraft.peerId} ${pullDraft.remoteProtocol}/${pullDraft.remotePort} → local ${(payload as PortMappingRule).local_port}`;
    showPullDialog.value = false;
    await loadMappings();
  } catch (error) {
    createError.value = error instanceof Error ? error.message : "Failed to create mapping";
  }
}

async function toggleMapping(rule: PortMappingRule): Promise<void> {
  try {
    const response = await fetch(`${apiUrl.value}/port_mappings/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await loadMappings();
  } catch (error) {
    mappingsError.value = error instanceof Error ? error.message : "Failed to toggle";
  }
}

async function deleteMapping(rule: PortMappingRule): Promise<void> {
  if (!window.confirm(`Delete mapping ${rule.local_host}:${rule.local_port} → ${rule.peer_id}?`)) {
    return;
  }
  try {
    const response = await fetch(`${apiUrl.value}/port_mappings/${rule.id}`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await loadMappings();
  } catch (error) {
    mappingsError.value = error instanceof Error ? error.message : "Failed to delete";
  }
}

function formatBindAddr(entry: LocalPortEntry): string {
  if (entry.bind_addr === "*") return "*";
  if (entry.bind_addr.includes(":")) return `[${entry.bind_addr}]`;
  return entry.bind_addr;
}

function formatLastUpdated(ms: string): string {
  const num = Number(ms);
  if (!Number.isFinite(num) || num <= 0) return "-";
  const delta = Date.now() - num;
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} min ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} h ago`;
  return new Date(num).toLocaleString();
}

function findPeerLabel(peerId: string): string {
  return peerId.length > 16 ? `${peerId.slice(0, 16)}…` : peerId;
}

onMounted(() => {
  void loadAll();
  pollTimer = window.setInterval(() => {
    void loadAll();
  }, 15_000);
});

onBeforeUnmount(() => {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
});
</script>

<template>
  <div class="card bg-base-100 border border-base-300 rounded-box">
    <div class="card-body gap-5">
      <!-- Header + summary -->
      <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 class="card-title text-base">Port Mapping</h3>
          <p class="text-xs text-base-content/60">
            Scan local listening ports, discover peers' services, and pull any of them to a local port.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <div class="badge badge-outline">{{ localPorts.length }} local</div>
          <div class="badge badge-outline">
            {{ totalPeerPorts }} peer ports / {{ peerCount }} peers
          </div>
          <div class="badge badge-outline">{{ activeMappingCount }} active mapping{{ activeMappingCount === 1 ? "" : "s" }}</div>
          <button class="btn btn-sm" type="button" :disabled="refreshing" @click="refreshScan">
            <span v-if="refreshing" class="loading loading-spinner loading-xs" />
            Rescan &amp; broadcast
          </button>
        </div>
      </div>

      <!-- Two-column: local + peers -->
      <div class="grid gap-4 lg:grid-cols-2">
        <section class="rounded-box border border-base-300 bg-base-200/45 p-4">
          <div class="mb-3 flex items-center justify-between">
            <h4 class="text-sm font-semibold uppercase tracking-[0.18em] text-base-content/55">
              Local listening ({{ selfPeerId }})
            </h4>
            <button class="btn btn-xs btn-ghost" type="button" :disabled="loadingScan" @click="loadLocalScan">
              Refresh
            </button>
          </div>
          <div v-if="scanError" class="alert alert-error text-xs mb-3">{{ scanError }}</div>
          <div v-if="loadingScan && localPorts.length === 0" class="text-xs text-base-content/50">
            Loading…
          </div>
          <div v-else-if="localPorts.length === 0" class="text-xs text-base-content/50">
            Nothing listening (or `lsof` unavailable).
          </div>
          <div v-else class="overflow-x-auto hidden sm:block">
            <table class="table table-xs w-full">
              <thead>
                <tr>
                  <th>Proto</th>
                  <th>Port</th>
                  <th>Bind</th>
                  <th>Process</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(entry, i) in localPorts" :key="`local-${i}`">
                  <td class="font-mono">{{ entry.protocol }}</td>
                  <td class="font-mono">{{ entry.port }}</td>
                  <td class="font-mono text-xs">{{ formatBindAddr(entry) }}</td>
                  <td class="text-xs">{{ entry.process_name ?? "-" }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <ul v-if="localPorts.length > 0" class="list sm:hidden">
            <li
              v-for="(entry, i) in localPorts"
              :key="`local-mobile-${i}`"
              class="list-row items-center gap-2 py-2"
            >
              <span class="badge badge-soft badge-sm font-mono">{{ entry.protocol }}</span>
              <span class="list-col-grow font-mono text-sm">:{{ entry.port }}</span>
              <span class="text-xs text-base-content/60">{{ entry.process_name ?? "-" }}</span>
              <span class="list-col-wrap text-xs text-base-content/40 font-mono">{{ formatBindAddr(entry) }}</span>
            </li>
          </ul>
        </section>

        <section class="rounded-box border border-base-300 bg-base-200/45 p-4">
          <div class="mb-3 flex items-center justify-between">
            <h4 class="text-sm font-semibold uppercase tracking-[0.18em] text-base-content/55">
              Peer listening
            </h4>
            <button class="btn btn-xs btn-ghost" type="button" :disabled="loadingPeers" @click="loadPeerScan">
              Refresh
            </button>
          </div>
          <div v-if="peersError" class="alert alert-error text-xs mb-3">{{ peersError }}</div>
          <div v-if="loadingPeers && peerPorts.length === 0" class="text-xs text-base-content/50">
            Loading…
          </div>
          <div v-else-if="peerPorts.length === 0" class="text-xs text-base-content/50">
            No peers have broadcast yet.
          </div>
          <div v-else class="space-y-4">
            <div
              v-for="group in peerPorts"
              :key="`peer-${group.peerId}`"
              class="rounded-xl border border-base-300 bg-base-100 p-3"
            >
              <div class="mb-2 flex items-center justify-between text-xs">
                <span class="font-semibold">
                  {{ findPeerLabel(group.peerId) }}
                </span>
                <span class="text-base-content/50">
                  {{ formatLastUpdated(group.lastUpdated) }} · {{ group.ports.length }} ports
                </span>
              </div>
              <div v-if="group.ports.length === 0" class="text-xs text-base-content/40">
                (empty)
              </div>
              <div v-else class="overflow-x-auto hidden sm:block">
                <table class="table table-xs w-full">
                <thead>
                  <tr>
                    <th>Proto</th>
                    <th>Port</th>
                    <th>Bind</th>
                    <th>Process</th>
                    <th class="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(entry, i) in group.ports" :key="`peer-${group.peerId}-${i}`">
                    <td class="font-mono">{{ entry.protocol }}</td>
                    <td class="font-mono">{{ entry.port }}</td>
                    <td class="font-mono text-xs">{{ formatBindAddr(entry) }}</td>
                    <td class="text-xs">{{ entry.process_name ?? "-" }}</td>
                    <td class="text-right">
                      <button
                        class="btn btn-xs btn-primary"
                        type="button"
                        @click="openPullDialog(group.peerId, entry)"
                      >
                        Pull to local
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
              </div>
              <ul v-if="group.ports.length > 0" class="list sm:hidden mt-1">
                <li
                  v-for="(entry, i) in group.ports"
                  :key="`peer-mobile-${group.peerId}-${i}`"
                  class="list-row items-start gap-2 py-2"
                >
                  <div class="list-col-grow flex flex-col gap-0.5">
                    <div class="flex items-center gap-2">
                      <span class="badge badge-soft badge-sm font-mono">{{ entry.protocol }}</span>
                      <span class="font-mono text-sm">:{{ entry.port }}</span>
                      <span class="text-xs text-base-content/60">{{ entry.process_name ?? "-" }}</span>
                    </div>
                    <span class="text-xs text-base-content/40 font-mono">{{ formatBindAddr(entry) }}</span>
                  </div>
                  <button
                    class="btn btn-xs btn-primary shrink-0"
                    type="button"
                    @click="openPullDialog(group.peerId, entry)"
                  >
                    Pull
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </section>
      </div>

      <!-- Active mappings -->
      <section class="rounded-box border border-base-300 bg-base-200/35 p-4">
        <div class="mb-3 flex items-center justify-between">
          <h4 class="text-sm font-semibold uppercase tracking-[0.18em] text-base-content/55">
            Active mappings
          </h4>
          <button class="btn btn-xs btn-ghost" type="button" :disabled="loadingMappings" @click="loadMappings">
            Refresh
          </button>
        </div>
        <div v-if="mappingsError" class="alert alert-error text-xs mb-3">{{ mappingsError }}</div>
        <div v-if="createSuccess" class="alert alert-success text-xs mb-3">{{ createSuccess }}</div>
        <div v-if="mappings.length === 0" class="text-xs text-base-content/50">
          No mappings yet. Pull a peer port to create one.
        </div>
        <div v-else class="overflow-x-auto hidden sm:block">
          <table class="table table-xs">
            <thead>
              <tr>
                <th class="w-10">On</th>
                <th>Local</th>
                <th>Peer</th>
                <th>Remote</th>
                <th>Proto</th>
                <th class="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="rule in mappings" :key="rule.id">
                <td>
                  <input
                    type="checkbox"
                    class="toggle toggle-xs"
                    :checked="rule.enabled"
                    @change="toggleMapping(rule)"
                  />
                </td>
                <td class="font-mono text-xs">{{ rule.local_host }}:{{ rule.local_port }}</td>
                <td class="text-xs max-w-[120px] truncate" :title="rule.peer_id + (rule.note ? ' · ' + rule.note : '')">
                  {{ findPeerLabel(rule.peer_id) }}
                </td>
                <td class="font-mono text-xs">{{ rule.remote_host }}:{{ rule.remote_port }}</td>
                <td><span class="badge badge-soft badge-xs font-mono uppercase">{{ rule.remote_protocol }}</span></td>
                <td class="text-right">
                  <button class="btn btn-xs btn-ghost text-error" type="button" @click="deleteMapping(rule)">
                    Del
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ul v-if="mappings.length > 0" class="list sm:hidden">
          <li
            v-for="rule in mappings"
            :key="`mapping-mobile-${rule.id}`"
            class="list-row flex-col items-stretch gap-2 py-3"
          >
            <div class="flex items-center gap-2 flex-wrap">
              <span class="badge badge-soft badge-sm font-mono uppercase">{{ rule.remote_protocol }}</span>
              <span class="font-mono text-xs">{{ rule.local_host }}:{{ rule.local_port }}</span>
              <span class="text-base-content/50 text-xs">→</span>
              <span class="font-mono text-xs">{{ rule.remote_host }}:{{ rule.remote_port }}</span>
            </div>
            <div class="flex items-center gap-2 text-xs text-base-content/60">
              <span>{{ findPeerLabel(rule.peer_id) }}</span>
              <span v-if="rule.note" class="text-base-content/40">· {{ rule.note }}</span>
            </div>
            <div class="flex items-center justify-between">
              <input
                type="checkbox"
                class="toggle toggle-sm"
                :checked="rule.enabled"
                @change="toggleMapping(rule)"
              />
              <button
                class="btn btn-xs btn-ghost text-error"
                type="button"
                @click="deleteMapping(rule)"
              >
                Delete
              </button>
            </div>
          </li>
        </ul>
      </section>

      <!-- Pull dialog -->
      <div v-if="showPullDialog" class="modal modal-open">
        <div class="modal-box">
          <h3 class="font-semibold text-sm mb-3">
            Pull {{ pullDraft.remoteProtocol }} / {{ pullDraft.remotePort }} from {{ findPeerLabel(pullDraft.peerId) }}
          </h3>
          <div v-if="pullDraft.suggestedLabel" class="text-xs text-base-content/50 mb-3">
            Service: {{ pullDraft.suggestedLabel }}
          </div>
          <div v-if="createError" class="alert alert-error text-xs mb-3">{{ createError }}</div>

          <div class="grid gap-3">
            <label class="form-control">
              <span class="label-text text-xs">Remote host (on peer)</span>
              <input v-model="pullDraft.remoteHost" class="input input-bordered input-sm w-full" />
            </label>
            <label class="form-control">
              <span class="label-text text-xs">Local host</span>
              <input v-model="pullDraft.localHost" class="input input-bordered input-sm w-full" />
            </label>
            <label class="form-control">
              <span class="label-text text-xs">
                Local port <span class="text-base-content/40">(blank = auto, e.g. remote+40000)</span>
              </span>
              <input
                v-model="pullDraft.localPort"
                class="input input-bordered input-sm w-full font-mono"
                placeholder="auto"
                inputmode="numeric"
              />
            </label>
            <label class="form-control">
              <span class="label-text text-xs">Note (optional)</span>
              <input v-model="pullDraft.note" class="input input-bordered input-sm w-full" placeholder="e.g. staging postgres" />
            </label>
          </div>

          <div class="modal-action">
            <button class="btn btn-ghost btn-sm" type="button" @click="closePullDialog">Cancel</button>
            <button class="btn btn-primary btn-sm" type="button" @click="submitPull">Create mapping</button>
          </div>
        </div>
        <div class="modal-backdrop" @click="closePullDialog"></div>
      </div>
    </div>
  </div>
</template>
