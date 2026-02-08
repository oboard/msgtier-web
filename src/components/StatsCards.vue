<script setup lang="ts">
import { computed } from 'vue';
import { apiData } from '../stores/data';

const data = computed(() => apiData.value);

const connections = computed(() => {
  const d = data.value;
  return d?.connections || 
         (d?.peers?.find(p => p.id === d.peer_id)?.connections) || 
         [];
});

const totalBandwidth = computed(() => 
  connections.value.reduce((sum, c) => sum + (c.bandwidth_mbps || 0), 0) || 0
);

const avgLatency = computed(() => {
  const validConnections = connections.value.filter(c => c.latency_ms || (c.latency_history && c.latency_history.length > 0));
  if (validConnections.length === 0) return 0;
  
  return validConnections.reduce((sum, c) => {
    const latency = c.latency_ms || (c.latency_history && c.latency_history.length > 0 ? c.latency_history[c.latency_history.length - 1] : 0);
    return sum + latency;
  }, 0) / validConnections.length;
});
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    <div class="stat bg-base-100 shadow-sm border border-base-300 rounded-box">
      <div class="stat-figure text-primary">
        <div class="p-2 bg-primary/10 rounded-lg">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="w-6 h-6 stroke-current">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        </div>
      </div>
      <div class="stat-title text-base-content/60">Total Peers</div>
      <div class="stat-value text-primary text-3xl">{{ data?.peers_count || 0 }}</div>
      <div class="stat-desc">Connected nodes</div>
    </div>

    <div class="stat bg-base-100 shadow-sm border border-base-300 rounded-box">
      <div class="stat-figure text-info">
        <div class="p-2 bg-info/10 rounded-lg">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="w-6 h-6 stroke-current">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6z"></path>
          </svg>
        </div>
      </div>
      <div class="stat-title text-base-content/60">Total Bandwidth</div>
      <div class="stat-value text-info text-3xl">{{ totalBandwidth.toFixed(2) }}</div>
      <div class="stat-desc">Mbps</div>
    </div>

    <div class="stat bg-base-100 shadow-sm border border-base-300 rounded-box">
      <div class="stat-figure text-warning">
        <div class="p-2 bg-warning/10 rounded-lg">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="w-6 h-6 stroke-current">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        </div>
      </div>
      <div class="stat-title text-base-content/60">Avg Latency</div>
      <div class="stat-value text-warning text-3xl">{{ avgLatency.toFixed(1) }}</div>
      <div class="stat-desc">ms</div>
    </div>
  </div>
</template>
