<script setup lang="ts">
import { computed } from "vue";
import { apiData } from "../stores/data";
import type { Peer, PortForwardMeta } from "../types/api";

interface PortForwardItem {
  peer: Peer;
  rule: PortForwardMeta;
}

const items = computed<PortForwardItem[]>(() => {
  const peers = apiData.value?.peers ?? [];
  return peers.flatMap((peer) => {
    const rules = Array.isArray(peer.metadata?.port_forwards)
      ? peer.metadata.port_forwards
      : [];
    return rules.map((rule) => ({ peer, rule }));
  });
});

const groupedItems = computed(() => {
  const peers = apiData.value?.peers ?? [];
  return peers
    .map((peer) => ({
      peer,
      rules: items.value.filter((item) => item.peer.id === peer.id),
    }))
    .filter((entry) => entry.rules.length > 0);
});

function formatDirection(rule: PortForwardMeta): string {
  return rule.direction === "forward" ? "Forward" : "Expose";
}

function formatPeer(rule: PortForwardMeta): string {
  if (rule.direction === "forward") {
    return rule.peer_id || "-";
  }
  if (Array.isArray(rule.peer_ids) && rule.peer_ids.length > 0) {
    return rule.peer_ids.join(", ");
  }
  return "-";
}

function formatEndpoint(rule: PortForwardMeta): string {
  if (rule.direction !== "forward") {
    return "Static target";
  }
  if (!rule.listen_port) {
    return "-";
  }
  return `${rule.listen_host || "127.0.0.1"}:${rule.listen_port}`;
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
</script>

<template>
  <div class="card bg-base-100 border border-base-300 rounded-box h-full">
    <div class="card-body gap-4">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="card-title text-base">Port Forwards</h3>
          <p class="text-xs text-base-content/60">
            Static bastion rules discovered from node metadata
          </p>
        </div>
        <div class="badge badge-outline">
          {{ groupedItems.length }} nodes / {{ items.length }} rules
        </div>
      </div>

      <div v-if="items.length === 0" class="alert alert-info text-sm">
        No port forwarding rules discovered.
      </div>

      <div v-else class="space-y-4 overflow-auto pr-1 max-h-[560px]">
        <div
          v-for="{ peer, rules } in groupedItems"
          :key="peer.id"
          class="border border-base-300 rounded-lg p-3 bg-base-200/40"
        >
          <div class="font-mono text-xs text-base-content/80 mb-3">
            {{ peer.id }}
          </div>

          <div class="space-y-2">
            <div
              v-for="{ rule } in rules"
              :key="`${peer.id}:${rule.direction}:${rule.id}:${rule.protocol}`"
              class="rounded-lg border border-base-300 bg-base-100 px-3 py-2"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <div class="font-semibold text-sm">
                    {{ rule.id }}
                  </div>
                  <div class="text-[11px] uppercase tracking-wide text-base-content/50">
                    {{ formatDirection(rule) }} · {{ rule.protocol }}
                  </div>
                </div>
                <div class="badge badge-sm" :class="getStateBadgeClass(rule.state)">
                  {{ rule.state }}
                </div>
              </div>

              <div class="mt-2 grid grid-cols-1 gap-2 text-xs text-base-content/70 md:grid-cols-3">
                <div>
                  <div class="uppercase tracking-wide text-base-content/40">Peer</div>
                  <div class="font-mono break-all">{{ formatPeer(rule) }}</div>
                </div>
                <div>
                  <div class="uppercase tracking-wide text-base-content/40">Endpoint</div>
                  <div class="font-mono break-all">{{ formatEndpoint(rule) }}</div>
                </div>
                <div>
                  <div class="uppercase tracking-wide text-base-content/40">Mode</div>
                  <div>{{ rule.direction === "forward" ? "Local listener" : "Remote target" }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
