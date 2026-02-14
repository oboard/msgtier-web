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

function formatBandwidth(mbps: number | undefined): string {
  if (mbps === undefined) return "-";
  if (mbps < 1) return `${(mbps * 1000).toFixed(1)} Kbps`;
  return `${mbps.toFixed(2)} Mbps`;
}

function formatPacketLoss(rate: number | undefined): string {
  if (rate === undefined) return "-";
  return `${(rate * 100).toFixed(1)}%`;
}
</script>

<template>
  <div class="card bg-base-100 shadow-sm border border-base-300 rounded-box">
    <div class="card-body p-0">
      <div class="overflow-x-auto">
        <table class="table table-zebra w-full">
          <thead class="bg-base-200/50">
            <tr>
              <th>Peer ID</th>
              <th>Protocols / Endpoints</th>
              <th>Latency</th>
              <th>Bandwidth</th>
              <th>Packet Loss</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(connection, i) in connections" :key="`${connection.peer_id}-${i}`" class="hover">
              <td class="font-mono text-sm">
                <div class="font-bold">{{ connection.peer_id }}</div>
                <div class="text-xs opacity-50">{{ connection.nat_type || 'Unknown NAT' }}</div>
              </td>
              <td>
                <div class="flex flex-col gap-1">
                  <div v-for="addr in getPeerAddresses(connection.peer_id)" :key="addr" class="flex items-center gap-2 text-xs font-mono">
                    <span class="badge badge-sm" :class="getProtocolColor(parseAddress(addr).protocol)">
                      {{ parseAddress(addr).protocol.toUpperCase() }}
                    </span>
                    <span :class="{'text-primary': parseAddress(addr).isIPv6}">
                      {{ parseAddress(addr).ip }}
                      <span v-if="parseAddress(addr).port">:{{ parseAddress(addr).port }}</span>
                    </span>
                  </div>
                  <div v-if="getPeerAddresses(connection.peer_id).length === 0" class="text-xs opacity-50 italic">
                    No addresses known
                  </div>
                </div>
              </td>
              <td>
                <div class="flex items-center space-x-2">
                  <span>{{ connection.latency_display || formatLatency(getLatency(connection)) }}</span>
                  <div v-if="getLatency(connection) && getLatency(connection)! > 100" class="badge badge-warning badge-xs">High</div>
                </div>
                <div v-if="connection.latency_history?.length" class="text-[10px] opacity-50 mt-1">
                  Last {{ connection.latency_history.length }}: {{ connection.latency_history.join(', ') }}
                </div>
              </td>
              <td>
                <div class="flex items-center space-x-2">
                  <span>{{ connection.bandwidth_display || formatBandwidth(connection.bandwidth_mbps) }}</span>
                  <progress
                    class="progress progress-primary w-16 h-2"
                    :value="connection.bandwidth_mbps"
                    :max="1"
                  ></progress>
                </div>
                <div class="text-[10px] opacity-50 mt-1">
                  Rx: {{ connection.bytes_received || 0 }} / Tx: {{ connection.bytes_sent || 0 }}
                </div>
              </td>
              <td>{{ connection.packet_loss_display || formatPacketLoss(connection.packet_loss_rate) }}</td>
            </tr>
          </tbody>
        </table>

        <div v-if="connections.length === 0" class="flex justify-center items-center py-8">
          <div class="text-center">
            <div class="text-4xl mb-2">🔍</div>
            <p class="text-base-content/70">No connections available</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
