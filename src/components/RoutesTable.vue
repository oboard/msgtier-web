<script setup lang="ts">
import { computed } from 'vue';
import { apiData } from '../stores/data';

const routes = computed(() => apiData.value?.routes || []);

function formatTime(timestamp: string) {
  // Assuming timestamp might be string representation of number or ISO string
  // The Svelte code uses parseInt, so it's likely a unix timestamp string
  const date = new Date(parseInt(timestamp));
  return date.toLocaleTimeString();
}
</script>

<template>
  <div class="card bg-base-100 shadow-sm border border-base-300 rounded-box mt-6">
    <div class="card-body p-0">
      <div class="p-4 border-b border-base-300 flex justify-between items-center">
        <h2 class="card-title text-base-content/80">Routing Table</h2>
        <div class="badge badge-neutral">{{ routes.length }}</div>
      </div>

      <div class="overflow-x-auto">
        <table class="table table-zebra w-full">
          <thead class="bg-base-200/50">
            <tr>
              <th>Target Peer ID</th>
              <th>Next Hop</th>
              <th>Hops</th>
              <th>Last Updated</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="route in routes" :key="route.target_peer_id + route.next_hop" class="hover">
              <td class="font-mono text-sm">{{ route.target_peer_id }}</td>
              <td class="font-mono text-sm">{{ route.next_hop }}</td>
              <td>
                <div class="badge badge-neutral">{{ route.hops }}</div>
              </td>
              <td class="text-sm opacity-70">{{ formatTime(route.timestamp) }}</td>
            </tr>
          </tbody>
        </table>

        <div v-if="routes.length === 0" class="flex justify-center items-center py-8">
          <div class="text-center">
            <div class="text-4xl mb-2">🛣️</div>
            <p class="text-base-content/70">No routes available</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
