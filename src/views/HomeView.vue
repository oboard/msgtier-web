<script setup lang="ts">
import StatsCards from "../components/StatsCards.vue";
import BandwidthChart from "../components/BandwidthChart.vue";
import ConfigPanel from "../components/ConfigPanel.vue";
</script>

<template>
  <div class="space-y-6">
    <StatsCards />
    <BandwidthChart />
    <ConfigPanel />
  </div>
</template>
