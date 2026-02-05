<script setup lang="ts">
import { computed } from 'vue';
import { apiData } from '../stores/data';

const connections = computed(() => {
  const d = apiData.value;
  return d?.connections ||
         (d?.peers?.find((p) => p.id === d?.peer_id)?.connections) ||
         [];
});

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
      <div class="p-4 border-b border-base-300 flex justify-between items-center">
        <h2 class="card-title text-base-content/80">Active Connections</h2>
        <div class="badge badge-neutral">{{ connections.length }}</div>
      </div>

      <div class="overflow-x-auto">
        <table class="table table-zebra w-full">
          <thead class="bg-base-200/50">
            <tr>
              <th>Peer ID</th>
              <th>Status</th>
              <th>Remote Address</th>
              <th>Latency</th>
              <th>Bandwidth</th>
              <th>Packet Loss</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(connection, i) in connections" :key="`${connection.peer_id}-${connection.remote_addr}-${i}`" class="hover">
              <td class="font-mono text-sm">{{ connection.peer_id }}</td>
              <td>
                <div class="badge badge-sm" :class="{
                  'badge-success': connection.state === 'Connected' || connection.active,
                  'badge-error': !(connection.state === 'Connected' || connection.active)
                }">
                  {{ connection.state || (connection.active ? "Active" : "Inactive") }}
                </div>
              </td>
              <td class="font-mono text-sm">{{ connection.remote_addr }}</td>
              <td>
                <div class="flex items-center space-x-2">
                  <span>{{ connection.latency_display || formatLatency(connection.latency_ms) }}</span>
                  <div v-if="connection.latency_ms && connection.latency_ms > 100" class="badge badge-warning badge-xs">High</div>
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
