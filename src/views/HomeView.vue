<script setup lang="ts">
import StatsCards from '../components/StatsCards.vue';
import BandwidthChart from '../components/BandwidthChart.vue';
import LatencyChart from '../components/LatencyChart.vue';
import PeerBandwidthChart from '../components/PeerBandwidthChart.vue';
import NetworkHealthCards from '../components/NetworkHealthCards.vue';
</script>

<template>
  <div class="space-y-6">
    <!-- KPI row -->
    <StatsCards />

    <!-- Two-column chart row: bandwidth timeline + latency timeline -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <BandwidthChart />
      <LatencyChart />
    </div>

    <!-- Full-width: bandwidth per peer (bar chart) -->
    <PeerBandwidthChart />

    <!-- Full-width: per-peer health tiles with sparklines -->
    <NetworkHealthCards />
  </div>
</template>
