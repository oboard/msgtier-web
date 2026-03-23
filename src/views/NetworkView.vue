<script setup lang="ts">
import NetworkGraph from "../components/NetworkGraph.vue";
import PortForwardsPanel from "../components/PortForwardsPanel.vue";
import ScriptPanel from "../components/ScriptPanel.vue";
</script>

<template>
  <div class="space-y-6">
    <div class="min-h-[320px] md:min-h-[480px] xl:min-h-[600px]">
      <NetworkGraph />
    </div>

    <div>
      <PortForwardsPanel />
    </div>

    <div>
      <ScriptPanel />
    </div>
  </div>
</template>
  
