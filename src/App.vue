<script setup lang="ts">
import Header from "./components/Header.vue";
import StatsCards from "./components/StatsCards.vue";
import NetworkGraph from "./components/NetworkGraph.vue";
import ConnectionsTable from "./components/ConnectionsTable.vue";
import RoutesTable from "./components/RoutesTable.vue";
import BandwidthChart from "./components/BandwidthChart.vue";
import { apiData } from "./stores/data";
</script>

<template>
  <div class="min-h-screen bg-base-200 p-4 md:p-6">
    <div class="max-w-7xl mx-auto space-y-6">
      <Header />

      <template v-if="apiData">
        <StatsCards />

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
              <h1 class="text-5xl font-bold">🚀</h1>
              <h1 class="text-3xl font-bold">Welcome to MsgTier WebUI</h1>
              <p class="py-6">
                Enter a URL above and click Connect to start monitoring your
                network connections in real-time.
              </p>
              <div class="flex justify-center space-x-4">
                <div class="badge badge-outline">Real-time Updates</div>
                <div class="badge badge-outline">D3.js Visualizations</div>
                <div class="badge badge-outline">Network Monitoring</div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
