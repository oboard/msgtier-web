<script setup lang="ts">
import NetworkGraph from "../components/NetworkGraph.vue";
import PortForwardsPanel from "../components/PortForwardsPanel.vue";
import ScriptPanel from "../components/ScriptPanel.vue";
</script>

<template>
  <div class="grid grid-cols-1 gap-6 xl:grid-cols-3 xl:items-start">
    <div class="xl:col-span-2 min-h-[320px] md:min-h-[480px] xl:min-h-[600px]">
      <NetworkGraph />
    </div>
    <div class="xl:col-span-1 xl:h-[600px] xl:overflow-y-auto xl:pr-1">
      <div class="space-y-6">
        <PortForwardsPanel />
        <ScriptPanel />
      </div>
    </div>
  </div>
</template>
  
