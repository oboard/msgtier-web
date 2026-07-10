<script setup lang="ts">
import { ref } from "vue";
import NetworkGraph from "../components/NetworkGraph.vue";
import PortForwardsPanel from "../components/PortForwardsPanel.vue";
import ScriptPanel from "../components/ScriptPanel.vue";

type Tab = "graph" | "ports" | "scripts";
const activeTab = ref<Tab>("graph");
</script>

<template>
  <!-- Desktop: original vertical stack (md and above) -->
  <div class="hidden md:block space-y-6">
    <section class="h-80 md:h-120 xl:h-150">
      <NetworkGraph />
    </section>
    <section>
      <PortForwardsPanel />
    </section>
    <section>
      <ScriptPanel />
    </section>
  </div>

  <!-- Mobile: tab switching (below md) -->
  <div class="md:hidden flex flex-col gap-3">
    <div role="tablist" class="tabs tabs-border w-full">
      <button
        role="tab"
        class="tab flex-1"
        :class="{ 'tab-active': activeTab === 'graph' }"
        @click="activeTab = 'graph'"
      >
        Graph
      </button>
      <button
        role="tab"
        class="tab flex-1"
        :class="{ 'tab-active': activeTab === 'ports' }"
        @click="activeTab = 'ports'"
      >
        Ports
      </button>
      <button
        role="tab"
        class="tab flex-1"
        :class="{ 'tab-active': activeTab === 'scripts' }"
        @click="activeTab = 'scripts'"
      >
        Scripts
      </button>
    </div>

    <section v-show="activeTab === 'graph'" class="h-80">
      <NetworkGraph />
    </section>
    <section v-show="activeTab === 'ports'">
      <PortForwardsPanel />
    </section>
    <section v-show="activeTab === 'scripts'">
      <ScriptPanel />
    </section>
  </div>
</template>
