<script setup lang="ts">
import { computed } from 'vue';
import { apiData } from '../stores/data';

const routes = computed(() => apiData.value?.routes || []);

function formatTime(timestamp: string) {
  // Assuming timestamp might be string representation of number or ISO string
  const date = new Date(parseInt(timestamp));
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getHopsColor(hops: number): string {
  if (hops <= 1) return 'badge-success';
  if (hops <= 3) return 'badge-info';
  if (hops <= 5) return 'badge-warning';
  return 'badge-error';
}

function truncateId(id: string): string {
  if (!id) return '';
  if (id.length <= 12) return id;
  return id.substring(0, 6) + '...' + id.substring(id.length - 6);
}
</script>

<template>
  <div class="card bg-base-100 shadow-lg border border-base-200 rounded-xl mt-6 overflow-hidden">
    <div class="card-body p-0">
      <div class="p-4 border-b border-base-200 flex justify-between items-center bg-base-200/30">
        <div class="flex items-center gap-2">
          <div class="p-2 bg-primary/10 rounded-lg text-primary">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          </div>
          <div>
            <h2 class="font-bold text-lg">Routing Table</h2>
            <p class="text-xs text-base-content/60">Active network paths</p>
          </div>
        </div>
        <div class="badge badge-primary badge-outline font-mono">{{ routes.length }} routes</div>
      </div>

      <div class="overflow-x-auto">
        <table class="table table-zebra w-full">
          <thead class="bg-base-200/50 text-xs uppercase font-bold tracking-wider text-base-content/70">
            <tr>
              <th class="pl-6">Target Peer ID</th>
              <th>Next Hop</th>
              <th class="text-center">Hops</th>
              <th class="text-right pr-6">Last Updated</th>
            </tr>
          </thead>
          <tbody class="text-sm">
            <tr v-for="route in routes" :key="route.target_peer_id + route.next_hop" class="hover group transition-colors">
              <td class="pl-6 font-mono">
                <div class="tooltip tooltip-right" :data-tip="route.target_peer_id">
                  <span class="font-semibold text-primary/80 group-hover:text-primary transition-colors cursor-help">
                    {{ truncateId(route.target_peer_id) }}
                  </span>
                </div>
              </td>
              <td class="font-mono text-base-content/80">
                <div class="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-base-content/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                  <div class="tooltip tooltip-right" :data-tip="route.next_hop">
                    <span class="cursor-help hover:text-base-content transition-colors">{{ truncateId(route.next_hop) }}</span>
                  </div>
                </div>
              </td>
              <td class="text-center">
                <div class="badge badge-sm font-medium" :class="getHopsColor(route.hops)">
                  {{ route.hops }}
                </div>
              </td>
              <td class="text-right pr-6 text-xs text-base-content/60 font-mono">
                {{ formatTime(route.timestamp) }}
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="routes.length === 0" class="flex flex-col justify-center items-center py-12 text-base-content/40 bg-base-100">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <p class="text-sm font-medium">No active routes found</p>
        </div>
      </div>
    </div>
  </div>
</template>
