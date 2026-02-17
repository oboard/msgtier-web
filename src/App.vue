<script setup lang="ts">
import { onMounted } from "vue";
import Header from "./components/Header.vue";
import StatsCards from "./components/StatsCards.vue";
import Chat from "./components/Chat.vue";
import NetworkGraph from "./components/NetworkGraph.vue";
import ConnectionsTable from "./components/ConnectionsTable.vue";
import RoutesTable from "./components/RoutesTable.vue";
import BandwidthChart from "./components/BandwidthChart.vue";
import { apiData, apiUrl } from "./stores/data";
import { startDataFetching } from "./services/dataService";

onMounted(() => {
  startDataFetching(apiUrl.value);
});
</script>

<template>
  <div class="min-h-screen bg-base-200 p-4 md:p-6">
    <div class="max-w-7xl mx-auto space-y-6">
      <Header />

      <template v-if="apiData">
        <StatsCards />
        
        <Chat />

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="lg:col-span-2">
            <NetworkGraph />
          </div>
          <div class="lg:col-span-2">
            <BandwidthChart />
          </div>
        </div>

        <ConnectionsTable />
        <RoutesTable />
      </template>
      <template v-else>
        <div class="hero min-h-96 bg-base-200 rounded-2xl">
          <div class="hero-content text-center">
            <div class="max-w-md">
              <span class="loading loading-spinner loading-lg text-primary"></span>
              <p class="py-6 text-base-content/70">
                Connecting to {{ apiUrl }}...
              </p>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
