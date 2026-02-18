<script setup lang="ts">
import { computed } from 'vue';
import { apiData } from '../stores/data';
import { parseAddress, getProtocolColor } from '../utils/address';

const connections = computed(() => {
  const d = apiData.value;
  // If root connections is missing, use the current peer's connections
  return d?.peers?.find((p) => p.id === d?.peer_id)?.connections || [];
});

function getPeerAddresses(peerId: string): string[] {
  const peer = apiData.value?.peers?.find((p) => p.id === peerId);
  return peer?.addresses || [];
}

function getLatency(c: any): number | undefined {
  return c.latency_ms || (c.latency_history?.length ? c.latency_history[c.latency_history.length - 1] : undefined);
}

function formatLatency(ms: number | undefined): string {
  if (ms === undefined) return "-";
  return `${ms.toFixed(1)}ms`;
}

function getLatencyColor(ms: number | undefined): string {
  if (ms === undefined) return 'bg-base-300';
  if (ms < 50) return 'bg-success';
  if (ms < 150) return 'bg-warning';
  return 'bg-error';
}

function formatBandwidth(mbps: number | undefined): string {
  if (mbps === undefined) return "-";
  if (mbps < 1) return `${(mbps * 1000).toFixed(1)} Kbps`;
  return `${mbps.toFixed(2)} Mbps`;
}

function formatPacketLoss(rate: number | undefined): string {
  if (rate === undefined) return "-";
  return `${(rate * 100).toFixed(1)}%`;
}

function getPacketLossColor(rate: number | undefined): string {
  if (rate === undefined || rate === 0) return 'text-success';
  if (rate < 0.01) return 'text-warning';
  return 'text-error';
}

function truncateId(id: string): string {
  if (!id) return '';
  if (id.length <= 12) return id;
  return id.substring(0, 6) + '...' + id.substring(id.length - 6);
}
</script>

<template>
  <div class="card bg-base-100 border border-base-200 rounded-xl overflow-hidden">
    <div class="card-body p-0">
      <div class="p-4 border-b border-base-200 flex justify-between items-center bg-base-200/30">
        <div class="flex items-center gap-2">
          <div class="p-2 bg-secondary/10 rounded-lg text-secondary">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24"
              stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h2 class="font-bold text-lg">Active Connections</h2>
            <p class="text-xs text-base-content/60">Real-time peer status</p>
          </div>
        </div>
        <div class="badge badge-secondary badge-outline font-mono">{{ connections.length }} peers</div>
      </div>

      <div class="overflow-x-auto">
        <table class="table table-zebra w-full">
          <thead class="bg-base-200/50 text-xs uppercase font-bold tracking-wider text-base-content/70">
            <tr>
              <th class="pl-6">Peer ID</th>
              <th>Endpoints</th>
              <th>Latency</th>
              <th>Bandwidth</th>
              <th class="text-right pr-6">Packet Loss</th>
            </tr>
          </thead>
          <tbody class="text-sm">
            <tr v-for="(connection, i) in connections" :key="`${connection.peer_id}-${i}`"
              class="hover group transition-colors">
              <td class="pl-6">
                <div class="flex items-center gap-3">
                  <div>
                    <div class="tooltip tooltip-right" :data-tip="connection.peer_id">
                      <div
                        class="font-mono font-bold text-base-content/90 cursor-help group-hover:text-primary transition-colors">
                        {{ truncateId(connection.peer_id) }}
                      </div>
                    </div>
                  </div>
                </div>
              </td>
              <td>
                <div class="flex flex-col gap-1.5">
                  <div v-for="addr in getPeerAddresses(connection.peer_id)" :key="addr"
                    class="flex items-center gap-2 text-xs font-mono bg-base-100 rounded border border-base-200 px-2 py-1 w-fit">
                    <div class="badge badge-xs font-bold border-0 text-white"
                      :class="getProtocolColor(parseAddress(addr).protocol)">
                      {{ parseAddress(addr).protocol.toUpperCase() }}
                    </div>
                    <span
                      :class="{ 'text-primary font-semibold': parseAddress(addr).isIPv6, 'opacity-80': !parseAddress(addr).isIPv6 }">
                      {{ parseAddress(addr).ip }}
                      <span v-if="parseAddress(addr).port" class="opacity-50">:{{ parseAddress(addr).port }}</span>
                    </span>
                  </div>
                  <div v-if="getPeerAddresses(connection.peer_id).length === 0"
                    class="text-xs opacity-50 italic flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24"
                      stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                    No addresses known
                  </div>
                </div>
              </td>
              <td>
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full" :class="getLatencyColor(getLatency(connection))"></div>
                  <span class="font-mono font-medium">{{ connection.latency_display ||
                    formatLatency(getLatency(connection)) }}</span>
                </div>
                <div v-if="connection.latency_history?.length" class="text-[10px] opacity-40 mt-1 font-mono">
                  Hist: {{ connection.latency_history.slice(-5).join(' ') }}
                </div>
              </td>
              <td class="w-48">
                <div class="flex flex-col gap-1">
                  <div class="flex justify-between items-end">
                    <span class="font-bold font-mono text-sm">{{ connection.bandwidth_display ||
                      formatBandwidth(connection.bandwidth_mbps) }}</span>
                  </div>
                  <progress class="progress progress-primary w-full h-1.5 bg-base-200"
                    :value="connection.bandwidth_mbps" :max="10"></progress>
                  <div class="flex justify-between text-[10px] font-mono opacity-60 mt-0.5">
                    <span class="flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24"
                        stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                      {{ connection.bytes_received || '0 B' }}
                    </span>
                    <span class="flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24"
                        stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M5 10l7-7m0 0l7 7m-7-7v18" />
                      </svg>
                      {{ connection.bytes_sent || '0 B' }}
                    </span>
                  </div>
                </div>
              </td>
              <td class="text-right pr-6">
                <div class="font-mono font-medium" :class="getPacketLossColor(connection.packet_loss_rate)">
                  {{ connection.packet_loss_display || formatPacketLoss(connection.packet_loss_rate) }}
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="connections.length === 0"
          class="flex flex-col justify-center items-center py-12 text-base-content/40 bg-base-100">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mb-3 opacity-20" fill="none" viewBox="0 0 24 24"
            stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p class="text-sm font-medium">No active connections</p>
        </div>
      </div>
    </div>
  </div>
</template>
