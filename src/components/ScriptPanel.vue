<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { apiData, apiUrl } from "../stores/data";
import type { Peer } from "../types/api";

interface ScriptRunState {
  loading: boolean;
  output: string;
  error: string | null;
  statusCode: number | null;
}

const extraArgsByPeer = reactive<Record<string, string>>({});
const runStateByKey = reactive<Record<string, ScriptRunState>>({});

const peersWithScripts = computed(() => {
  const peers = apiData.value?.peers ?? [];
  return peers
    .map((peer) => ({
      peer,
      scripts: parseScripts(peer),
    }))
    .filter((item) => item.scripts.length > 0);
});

const totalScripts = computed(() =>
  peersWithScripts.value.reduce((sum, item) => sum + item.scripts.length, 0),
);

const lastRunKey = ref<string | null>(null);

function parseScripts(peer: Peer): string[] {
  const raw = peer.metadata?.scripts;
  if (!raw || typeof raw !== "string") {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is string => typeof item === "string")
        .map((name) => name.trim())
        .filter((name) => name.length > 0);
    }
  } catch {
    return raw
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
  }

  return [];
}

function getRunState(key: string): ScriptRunState {
  if (!runStateByKey[key]) {
    runStateByKey[key] = {
      loading: false,
      output: "",
      error: null,
      statusCode: null,
    };
  }
  return runStateByKey[key];
}

function normalizeOutput(raw: string): string {
  if (!raw) return "";
  // Strip ANSI escape sequences (common in terminal tools like fastfetch)
  const noAnsi = raw.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
  // Remove NUL and other non-printable controls except newline/tab
  return noAnsi.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, "");
}

async function runScript(peer: Peer, scriptName: string): Promise<void> {
  const key = `${peer.id}:${scriptName}`;
  const state = getRunState(key);
  const extraArgs = (extraArgsByPeer[peer.id] ?? "").trim();
  const command = extraArgs.length > 0 ? `${scriptName} ${extraArgs}` : scriptName;

  state.loading = true;
  state.error = null;
  state.statusCode = null;
  lastRunKey.value = key;

  try {
    const response = await fetch(`${apiUrl.value}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        target: peer.id,
        kind: "script",
        timeout: "30000",
      },
      body: command,
    });

    const output = normalizeOutput(await response.text());
    state.statusCode = response.status;
    if (!response.ok) {
      throw new Error(output || `Request failed: ${response.status}`);
    }
    state.output = output.length > 0 ? output : "(empty response)";
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Unknown error";
  } finally {
    state.loading = false;
  }
}
</script>

<template>
  <div class="card bg-base-100 border border-base-300 rounded-box h-full">
    <div class="card-body gap-4">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="card-title text-base">Scripts</h3>
          <p class="text-xs text-base-content/60">
            Per-node quick run panel
          </p>
        </div>
        <div class="badge badge-outline">
          {{ peersWithScripts.length }} nodes / {{ totalScripts }} scripts
        </div>
      </div>

      <div
        v-if="peersWithScripts.length === 0"
        class="alert alert-info text-sm"
      >
        No scripts discovered from node metadata.
      </div>

      <div v-else class="space-y-4 overflow-auto pr-1 max-h-[560px]">
        <div
          v-for="{ peer, scripts } in peersWithScripts"
          :key="peer.id"
          class="border border-base-300 rounded-lg p-3 bg-base-200/40"
        >
          <div class="font-mono text-xs text-base-content/80 mb-2">
            {{ peer.id }}
          </div>
          <input
            v-model="extraArgsByPeer[peer.id]"
            type="text"
            class="input input-sm input-bordered w-full mb-2"
            placeholder="附加参数，例如：--verbose 123"
          />
          <div class="flex flex-wrap gap-2">
            <button
              v-for="scriptName in scripts"
              :key="`${peer.id}:${scriptName}`"
              class="btn btn-sm btn-primary btn-outline"
              :class="{ 'btn-disabled': getRunState(`${peer.id}:${scriptName}`).loading }"
              :disabled="getRunState(`${peer.id}:${scriptName}`).loading"
              @click="runScript(peer, scriptName)"
            >
              {{ scriptName }}
            </button>
          </div>
        </div>
      </div>

      <div
        v-if="lastRunKey && runStateByKey[lastRunKey]"
        class="border border-base-300 rounded-lg p-3 bg-base-200/50"
      >
        <div class="text-xs font-mono text-base-content/70 mb-1">
          Last run: {{ lastRunKey }}
        </div>
        <div
          v-if="runStateByKey[lastRunKey].statusCode !== null"
          class="text-[11px] text-base-content/60 mb-2"
        >
          HTTP {{ runStateByKey[lastRunKey].statusCode }}
        </div>
        <div
          v-if="runStateByKey[lastRunKey].error"
          class="text-error text-xs whitespace-pre-wrap"
        >
          {{ runStateByKey[lastRunKey].error }}
        </div>
        <pre
          v-else
          class="text-xs bg-base-100 rounded p-2 overflow-auto max-h-36 whitespace-pre-wrap break-all"
        >{{ runStateByKey[lastRunKey].output }}</pre>
      </div>
    </div>
  </div>
</template>
