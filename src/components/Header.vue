<script setup lang="ts">
import { connectionStatus, fetchError } from '../stores/data';
</script>

<template>
  <div class="navbar bg-base-100 shadow-sm border border-base-300 rounded-box sticky top-2 z-50">
    <div class="navbar-start">
      <div class="dropdown lg:hidden">
        <div tabindex="0" role="button" class="btn btn-ghost btn-circle">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7" /></svg>
        </div>
        <ul tabindex="0" class="menu menu-sm dropdown-content mt-3 z-1 p-2 shadow bg-base-100 rounded-box w-52">
          <li><RouterLink to="/" active-class="active">Dashboard</RouterLink></li>
          <li><RouterLink to="/chat" active-class="active">Chat</RouterLink></li>
          <li><RouterLink to="/network" active-class="active">Network Graph</RouterLink></li>
          <li><RouterLink to="/connections" active-class="active">Connections</RouterLink></li>
        </ul>
      </div>
      <div class="flex items-center space-x-3 pl-2">
        <div class="avatar">
          <div class="w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <span class="text-xl font-bold">MT</span>
          </div>
        </div>
        <div class="hidden sm:block">
          <h1 class="text-lg font-bold">MsgTier</h1>
          <p class="text-xs opacity-60">Network Monitor</p>
        </div>
      </div>
    </div>
    
    <div class="navbar-center hidden lg:flex">
      <ul class="menu menu-horizontal px-1 gap-1">
        <li><RouterLink to="/" active-class="active" class="font-medium">Dashboard</RouterLink></li>
        <li><RouterLink to="/chat" active-class="active" class="font-medium">Chat</RouterLink></li>
        <li><RouterLink to="/network" active-class="active" class="font-medium">Network Graph</RouterLink></li>
        <li><RouterLink to="/connections" active-class="active" class="font-medium">Connections</RouterLink></li>
      </ul>
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
