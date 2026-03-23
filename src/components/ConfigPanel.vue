<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { apiData, apiUrl } from "../stores/data";
import type { ConfigResponse, HotConfigLayer } from "../types/api";

type TernaryValue = "null" | "true" | "false";

interface ConfigFormState {
  scriptsText: string;
  metadataText: string;
  forwardsText: string;
  exposesText: string;
  whitelistText: string;
  openclaw: TernaryValue;
  relayAllPeerRpc: TernaryValue;
  disableEncryption: TernaryValue;
  openclawPluginVersion: string;
  openclawToken: string;
  foreignRelayBpsLimit: string;
  uploadDir: string;
  hotReloadEnable: boolean;
  hotReloadSecret: string;
}

const selectedPeerId = ref<string>("");
const configData = ref<ConfigResponse | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);
const saveError = ref<string | null>(null);
const saveSuccess = ref<string | null>(null);
const authSecret = ref("");
const form = reactive<ConfigFormState>(emptyFormState());

const nodeOptions = computed(() => {
  const peers = apiData.value?.peers ?? [];
  return peers
    .map((peer) => ({ id: peer.id, self: peer.id === apiData.value?.peer_id }))
    .sort((a, b) => a.id.localeCompare(b.id));
});

const staticConfig = computed(() => configData.value?.static_config ?? null);

watch(
  () => [apiData.value?.peer_id, nodeOptions.value.map((item) => item.id).join(",")],
  () => {
    if (!selectedPeerId.value) {
      selectedPeerId.value = apiData.value?.peer_id ?? "";
    } else if (!nodeOptions.value.some((item) => item.id === selectedPeerId.value)) {
      selectedPeerId.value = apiData.value?.peer_id ?? "";
    }
  },
  { immediate: true },
);

watch(
  () => selectedPeerId.value,
  (peerId) => {
    if (!peerId) {
      configData.value = null;
      return;
    }
    void loadConfig(peerId);
  },
  { immediate: true },
);

function emptyFormState(): ConfigFormState {
  return {
    scriptsText: "{}",
    metadataText: "{}",
    forwardsText: "{}",
    exposesText: "{}",
    whitelistText: "",
    openclaw: "null",
    relayAllPeerRpc: "null",
    disableEncryption: "null",
    openclawPluginVersion: "",
    openclawToken: "",
    foreignRelayBpsLimit: "",
    uploadDir: "",
    hotReloadEnable: true,
    hotReloadSecret: "",
  };
}

function updateForm(next: ConfigFormState): void {
  Object.assign(form, next);
}

function prettyJson(value: unknown, fallback: string): string {
  if (!value || (typeof value === "object" && Object.keys(value as Record<string, unknown>).length === 0)) {
    return fallback;
  }
  return JSON.stringify(value, null, 2);
}

function encodeTernary(value: boolean | null | undefined): TernaryValue {
  if (value === true) return "true";
  if (value === false) return "false";
  return "null";
}

function decodeTernary(value: TernaryValue): boolean | null {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function hydrateForm(config: ConfigResponse): void {
  const hot = config.hot_config ?? {};
  updateForm({
    scriptsText: prettyJson(hot.scripts ?? {}, "{}"),
    metadataText: prettyJson(hot.metadata ?? {}, "{}"),
    forwardsText: prettyJson(hot.forwards ?? {}, "{}"),
    exposesText: prettyJson(hot.exposes ?? {}, "{}"),
    whitelistText: Array.isArray(hot.relay_network_whitelist) ? hot.relay_network_whitelist.join("\n") : "",
    openclaw: encodeTernary(hot.openclaw),
    relayAllPeerRpc: encodeTernary(hot.relay_all_peer_rpc),
    disableEncryption: encodeTernary(hot.disable_encryption),
    openclawPluginVersion: hot.openclaw_plugin_version ?? "",
    openclawToken: hot.openclaw_token ?? "",
    foreignRelayBpsLimit: hot.foreign_relay_bps_limit == null ? "" : String(hot.foreign_relay_bps_limit),
    uploadDir: hot.upload_dir ?? "",
    hotReloadEnable: hot.hot_reload?.enable ?? true,
    hotReloadSecret: hot.hot_reload?.secret ?? "",
  });
}

function buildConfigUrl(peerId: string, path: string): string {
  const localPeerId = apiData.value?.peer_id;
  const localPath = path.startsWith("/api/") ? path.slice(4) : path;
  if (!localPeerId || peerId === localPeerId) {
    return `${apiUrl.value}${localPath}`;
  }
  const query = new URLSearchParams({
    peer: peerId,
    path,
  });
  return `${apiUrl.value}/proxy?${query.toString()}`;
}

async function loadConfig(peerId: string): Promise<void> {
  loading.value = true;
  loadError.value = null;
  saveSuccess.value = null;
  try {
    const response = await fetch(buildConfigUrl(peerId, "/api/config"));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json()) as ConfigResponse;
    configData.value = data;
    hydrateForm(data);
  } catch (error) {
    configData.value = null;
    loadError.value = error instanceof Error ? error.message : "Failed to load config";
  } finally {
    loading.value = false;
  }
}

function parseJsonMap(label: string, raw: string): Record<string, string> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {};
  }
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as Record<string, string>;
}

function parseStringArray(raw: string): string[] | null {
  const items = raw
    .split("\n")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items.length > 0 ? items : [];
}

function buildPatchPayload(): HotConfigLayer {
  const foreignRelayBpsLimit = form.foreignRelayBpsLimit.trim();
  if (foreignRelayBpsLimit && Number.isNaN(Number(foreignRelayBpsLimit))) {
    throw new Error("Foreign relay BPS limit must be a number");
  }

  return {
    scripts: parseJsonMap("Scripts", form.scriptsText),
    metadata: parseJsonMap("Metadata", form.metadataText),
    forwards: parseJsonMap("Forwards", form.forwardsText),
    exposes: parseJsonMap("Exposes", form.exposesText),
    relay_network_whitelist: parseStringArray(form.whitelistText),
    openclaw: decodeTernary(form.openclaw),
    relay_all_peer_rpc: decodeTernary(form.relayAllPeerRpc),
    disable_encryption: decodeTernary(form.disableEncryption),
    openclaw_plugin_version: form.openclawPluginVersion.trim() || null,
    openclaw_token: form.openclawToken.trim() || null,
    foreign_relay_bps_limit: foreignRelayBpsLimit ? Number(foreignRelayBpsLimit) : null,
    upload_dir: form.uploadDir.trim() || null,
    hot_reload: {
      enable: form.hotReloadEnable,
      secret: form.hotReloadSecret.trim() || null,
    },
  };
}

async function saveConfig(): Promise<void> {
  if (!selectedPeerId.value) {
    return;
  }

  saveError.value = null;
  saveSuccess.value = null;
  loading.value = true;
  try {
    const response = await fetch(buildConfigUrl(selectedPeerId.value, "/api/config/hot-reload"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        secret: authSecret.value.trim() || undefined,
        config: buildPatchPayload(),
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const errorMessage = payload && typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`;
      throw new Error(errorMessage);
    }

    configData.value = payload as ConfigResponse;
    hydrateForm(configData.value);
    saveSuccess.value = `Updated ${selectedPeerId.value}`;
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : "Failed to save config";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="card bg-base-100 border border-base-300 rounded-box">
    <div class="card-body gap-5">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 class="card-title text-base">Config Hot Reload</h3>
          <p class="text-xs text-base-content/60">
            Static config is read-only. Only runtime config is editable and `port` is no longer part of the form.
          </p>
        </div>
        <label class="form-control w-full lg:max-w-xs">
          <span class="label-text text-xs uppercase tracking-[0.2em] text-base-content/50">Target node</span>
          <select v-model="selectedPeerId" class="select select-bordered">
            <option v-for="item in nodeOptions" :key="item.id" :value="item.id">
              {{ item.id }}{{ item.self ? " (local)" : "" }}
            </option>
          </select>
        </label>
      </div>

      <div v-if="loadError" class="alert alert-error text-sm">
        {{ loadError }}
      </div>

      <div v-if="staticConfig" class="grid gap-3 lg:grid-cols-2">
        <div class="rounded-box border border-base-300 bg-base-200/50 p-4">
          <div class="text-xs uppercase tracking-[0.2em] text-base-content/50">Static layer</div>
          <div class="mt-3 space-y-2 text-sm">
            <div><span class="text-base-content/60">ID:</span> <span class="font-mono">{{ staticConfig.id }}</span></div>
            <div><span class="text-base-content/60">Peers:</span> {{ staticConfig.peers.length }}</div>
            <div><span class="text-base-content/60">Listeners:</span> {{ staticConfig.listeners.length }}</div>
            <div><span class="text-base-content/60">Web API:</span> <span class="font-mono">{{ staticConfig.web_api || "-" }}</span></div>
          </div>
        </div>

        <div class="rounded-box border border-base-300 bg-base-200/50 p-4">
          <div class="text-xs uppercase tracking-[0.2em] text-base-content/50">Hot reload auth</div>
          <div class="mt-3 space-y-3">
            <label class="form-control">
              <span class="label-text">Request secret</span>
              <input v-model="authSecret" type="password" class="input input-bordered" placeholder="Required when hot_reload.secret is set" />
            </label>
            <div class="text-xs text-base-content/60">
              This secret is sent with the update request. It does not change the node config by itself.
            </div>
          </div>
        </div>
      </div>

      <div v-if="configData" class="grid gap-4 xl:grid-cols-2">
        <label class="form-control">
          <span class="label-text">Scripts JSON</span>
          <textarea v-model="form.scriptsText" class="textarea textarea-bordered min-h-40 font-mono text-xs" spellcheck="false"></textarea>
        </label>

        <label class="form-control">
          <span class="label-text">Metadata JSON</span>
          <textarea v-model="form.metadataText" class="textarea textarea-bordered min-h-40 font-mono text-xs" spellcheck="false"></textarea>
        </label>

        <label class="form-control">
          <span class="label-text">Forwards JSON</span>
          <textarea v-model="form.forwardsText" class="textarea textarea-bordered min-h-40 font-mono text-xs" spellcheck="false"></textarea>
        </label>

        <label class="form-control">
          <span class="label-text">Exposes JSON</span>
          <textarea v-model="form.exposesText" class="textarea textarea-bordered min-h-40 font-mono text-xs" spellcheck="false"></textarea>
        </label>
      </div>

      <div v-if="configData" class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label class="form-control">
          <span class="label-text">OpenClaw</span>
          <select v-model="form.openclaw" class="select select-bordered">
            <option value="null">inherit</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </label>

        <label class="form-control">
          <span class="label-text">Relay All Peer RPC</span>
          <select v-model="form.relayAllPeerRpc" class="select select-bordered">
            <option value="null">inherit</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </label>

        <label class="form-control">
          <span class="label-text">Disable Encryption</span>
          <select v-model="form.disableEncryption" class="select select-bordered">
            <option value="null">inherit</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </label>

        <label class="form-control">
          <span class="label-text">Foreign Relay BPS Limit</span>
          <input v-model="form.foreignRelayBpsLimit" type="text" class="input input-bordered" placeholder="null" />
        </label>

        <label class="form-control">
          <span class="label-text">OpenClaw Plugin Version</span>
          <input v-model="form.openclawPluginVersion" type="text" class="input input-bordered" placeholder="null" />
        </label>

        <label class="form-control">
          <span class="label-text">OpenClaw Token</span>
          <input v-model="form.openclawToken" type="text" class="input input-bordered" placeholder="null" />
        </label>

        <label class="form-control">
          <span class="label-text">Upload Dir</span>
          <input v-model="form.uploadDir" type="text" class="input input-bordered" placeholder="null" />
        </label>

        <label class="form-control">
          <span class="label-text">Relay Network Whitelist</span>
          <textarea v-model="form.whitelistText" class="textarea textarea-bordered min-h-28 text-xs" placeholder="One item per line"></textarea>
        </label>
      </div>

      <div v-if="configData" class="grid gap-4 md:grid-cols-[auto,1fr,1fr] items-end rounded-box border border-base-300 bg-base-200/40 p-4">
        <label class="label cursor-pointer justify-start gap-3">
          <input v-model="form.hotReloadEnable" type="checkbox" class="checkbox checkbox-primary" />
          <span class="label-text">Allow hot reload</span>
        </label>
        <label class="form-control">
          <span class="label-text">Hot reload secret</span>
          <input v-model="form.hotReloadSecret" type="text" class="input input-bordered" placeholder="null" />
        </label>
        <div class="text-xs text-base-content/60">
          If set, every local or proxied update request must include the matching request secret.
        </div>
      </div>

      <div v-if="saveError" class="alert alert-error text-sm">
        {{ saveError }}
      </div>
      <div v-if="saveSuccess" class="alert alert-success text-sm">
        {{ saveSuccess }}
      </div>

      <div class="flex flex-wrap justify-end gap-3">
        <button class="btn btn-ghost" :disabled="loading || !selectedPeerId" @click="selectedPeerId && loadConfig(selectedPeerId)">
          Reload
        </button>
        <button class="btn btn-primary" :disabled="loading || !configData" @click="saveConfig">
          <span v-if="loading" class="loading loading-spinner loading-sm"></span>
          Apply hot config
        </button>
      </div>
    </div>
  </div>
</template>
