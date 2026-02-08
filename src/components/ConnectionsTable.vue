<script setup lang="ts">
import { computed } from 'vue';
import { apiData } from '../stores/data';

const connections = computed(() => {
  const d = apiData.value;
  return d?.connections ||
         (d?.peers?.find((p) => p.id === d?.peer_id)?.connections) ||
         [];
});

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
              <th>Remote Address</th>
              <th>Latency</th>
              <th>Bandwidth</th>
              <th>Packet Loss</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(connection, i) in connections" :key="`${connection.peer_id}-${connection.remote_addr}-${i}`" class="hover">
              <td class="font-mono text-sm">{{ connection.peer_id }}</td>
              <td class="font-mono text-sm">{{ connection.remote_addr }}</td>
              <td>
                <div class="flex items-center space-x-2">
                  <span>{{ connection.latency_display || formatLatency(getLatency(connection)) }}</span>
                  <div v-if="getLatency(connection) && getLatency(connection)! > 100" class="badge badge-warning badge-xs">High</div>
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
