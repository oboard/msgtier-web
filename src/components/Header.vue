<script setup lang="ts">
import { ref, computed } from 'vue';
import { apiUrl, connectionStatus, fetchError } from '../stores/data';
import { startDataFetching, stopDataFetching } from '../services/dataService';

const urlInput = ref('');
const isConnected = computed(() => connectionStatus.value === 'connected');

const handleConnect = () => {
  if (urlInput.value.trim()) {
    apiUrl.value = urlInput.value.trim();
    startDataFetching(urlInput.value.trim());
  }
};

const handleDisconnect = () => {
  stopDataFetching();
};
</script>

<template>
  <div class="navbar bg-base-100 shadow-sm border border-base-300 rounded-box">
    <div class="navbar-start">
      <div class="flex items-center space-x-3 pl-2">
        <div class="avatar">
          <div class="w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <span class="text-xl font-bold">MT</span>
          </div>
        </div>
        <div>
          <h1 class="text-lg font-bold">MsgTier</h1>
          <p class="text-xs opacity-60">Network Monitor</p>
        </div>
      </div>
    </div>
    
    <div class="navbar-center">
      <div class="join">
        <input 
          type="text" 
          placeholder="/api" 
          class="input input-bordered input-sm w-64 join-item focus:outline-none"
          v-model="urlInput"
          @keydown.enter="handleConnect"
        />
        <button v-if="isConnected" class="btn btn-error btn-sm join-item" @click="handleDisconnect">
          Disconnect
        </button>
        <button v-else class="btn btn-primary btn-sm join-item" @click="handleConnect" :disabled="!urlInput.trim()">
          Connect
        </button>
      </div>
    </div>
    
    <div class="navbar-end pr-2">
      <div class="flex items-center space-x-2">
        <div class="badge gap-2" :class="{
          'badge-success': connectionStatus === 'connected',
          'badge-warning': connectionStatus === 'loading',
          'badge-error': connectionStatus !== 'connected' && connectionStatus !== 'loading'
        }">
          <span v-if="connectionStatus === 'loading'" class="loading loading-spinner loading-xs"></span>
          {{ connectionStatus }}
        </div>
      </div>
    </div>
  </div>

  <div v-if="fetchError" class="alert alert-error mb-4">
    <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <span>Error: {{ fetchError }}</span>
  </div>
</template>
