<script setup lang="ts">
import { onMounted } from "vue";
import { RouterView, RouterLink } from "vue-router";
import Header from "./components/Header.vue";
import { apiData, apiUrl } from "./stores/data";
import { startDataFetching } from "./services/dataService";

onMounted(() => {
  startDataFetching(apiUrl.value);
});
</script>

<template>
  <div class="min-h-screen bg-base-200 p-2 md:p-6 pb-20 md:pb-6">
    <div class="max-w-7xl mx-auto space-y-4 md:space-y-6">
      <Header />

      <template v-if="apiData">
        <RouterView />
      </template>
      <template v-else>
        <div class="hero min-h-96 bg-base-100 rounded-2xl shadow-xl">
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

    <!-- Mobile Bottom Navigation -->
    <div class="dock md:hidden z-50">
      <RouterLink to="/" active-class="dock-active text-primary">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
        <span class="dock-label">Home</span>
      </RouterLink>
      <RouterLink to="/chat" active-class="dock-active text-primary">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
        <span class="dock-label">Chat</span>
      </RouterLink>
      <RouterLink to="/network" active-class="dock-active text-primary">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
        </svg>
        <span class="dock-label">Network</span>
      </RouterLink>
      <RouterLink to="/connections" active-class="dock-active text-primary">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
        <span class="dock-label">Conns</span>
      </RouterLink>
    </div>
  </div>
</template>
