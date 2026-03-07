<script setup lang="ts">
import NetworkGraph from "../components/NetworkGraph.vue";
import ScriptPanel from "../components/ScriptPanel.vue";
</script>

<template>
  <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
    <div class="xl:col-span-2 min-h-[600px]">
      <NetworkGraph />
    </div>
    <div class="xl:col-span-1">
      <ScriptPanel />
    </div>
  </div>
</template>
  
