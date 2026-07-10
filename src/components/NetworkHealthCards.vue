<script setup lang="ts">
///|
import { computed } from 'vue';
import { apiData } from '../stores/data';
import type { Connection } from '../types/api';

///|
interface PeerCard {
  peerId: string;
  shortId: string;
  connections: Connection[];
  totalBandwidth: number;
  avgLatency: number | undefined;
  packetLoss: number | undefined;
  quality: number; // 0–100
  relayCount: number;
  latencyHistory: number[];
}

const cards = computed<PeerCard[]>(() => {
  const d = apiData.value;
  if (!d) return [];

  return (d.peers ?? [])
    .filter(p => p.connections.length > 0)
    .map(p => {
      const conns = p.connections;
      const totalBandwidth = conns.reduce((s, c) => s + (c.bandwidth_mbps || 0), 0);

      const latencies = conns.flatMap(c => {
        const v = c.latency_ms ?? (c.latency_history?.length ? c.latency_history[c.latency_history.length - 1] : undefined);
        return v !== undefined ? [v] : [];
      });
      const avgLatency = latencies.length
        ? latencies.reduce((s, v) => s + v, 0) / latencies.length
        : undefined;

      const lossValues = conns.map(c => c.packet_loss_rate ?? 0);
      const avgLoss = lossValues.length
        ? lossValues.reduce((s, v) => s + v, 0) / lossValues.length
        : undefined;

      // Merge latency histories (take first conn's history for sparkline)
      const latencyHistory = conns[0]?.latency_history ?? [];

      // Quality: 100 - loss*100 - clamp(latency/5, 0, 40)
      let quality = 100;
      if (avgLatency !== undefined) quality -= Math.min(40, avgLatency / 5);
      if (avgLoss !== undefined) quality -= avgLoss * 100;
      quality = Math.max(0, Math.round(quality));

      const relayCount = conns.filter(c => c.relay > 0).length;

      return {
        peerId: p.id,
        shortId: p.id.slice(0, 8),
        connections: conns,
        totalBandwidth,
        avgLatency,
        packetLoss: avgLoss,
        quality,
        relayCount,
        latencyHistory,
      };
    });
});

///|
function qualityColor(q: number): string {
  if (q >= 80) return 'text-success';
  if (q >= 50) return 'text-warning';
  return 'text-error';
}

function qualityBg(q: number): string {
  if (q >= 80) return 'bg-success';
  if (q >= 50) return 'bg-warning';
  return 'bg-error';
}

function latencyColor(ms: number | undefined): string {
  if (ms === undefined) return 'text-base-content/40';
  if (ms < 50) return 'text-success';
  if (ms < 150) return 'text-warning';
  return 'text-error';
}

function formatBandwidth(mbps: number): string {
  if (mbps === 0) return '—';
  if (mbps < 1) return `${(mbps * 1000).toFixed(0)} Kbps`;
  return `${mbps.toFixed(2)} Mbps`;
}

function formatLatency(ms: number | undefined): string {
  if (ms === undefined) return '—';
  return `${ms.toFixed(1)} ms`;
}

function formatLoss(rate: number | undefined): string {
  if (rate === undefined) return '—';
  return `${(rate * 100).toFixed(1)}%`;
}

///|
// Inline sparkline: renders latency_history as an SVG path
function sparklinePath(history: number[]): string {
  if (history.length < 2) return '';
  const W = 60;
  const H = 20;
  const min = Math.min(...history);
  const max = Math.max(...history) || 1;
  const xStep = W / (history.length - 1);
  const pts = history.map((v, i) => {
    const x = i * xStep;
    const y = H - ((v - min) / (max - min + 0.01)) * H;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  return pts.join(' ');
}
</script>

<template>
  <div class="card bg-base-100 border border-base-200 rounded-xl">
    <div class="card-body p-4 gap-3">
      <!-- Header -->
      <div class="flex items-center gap-2">
        <div class="p-2 bg-success/10 rounded-lg text-success">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24"
            stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <div>
          <h3 class="font-bold text-sm">Peer Health</h3>
          <p class="text-xs text-base-content/50">Per-peer quality snapshot</p>
        </div>
        <div class="ml-auto badge badge-ghost badge-sm font-mono">{{ cards.length }} peers</div>
      </div>

      <!-- Empty state -->
      <div v-if="cards.length === 0" class="flex flex-col items-center py-6 text-base-content/30">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 mb-2 opacity-30" fill="none" viewBox="0 0 24 24"
          stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <p class="text-xs">No peers with active connections</p>
      </div>

      <!-- Cards grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        <div
          v-for="card in cards"
          :key="card.peerId"
          class="bg-base-200/40 border border-base-200 rounded-lg p-3 flex flex-col gap-2 hover:bg-base-200/70 transition-colors"
        >
          <!-- Peer ID + quality score -->
          <div class="flex items-center justify-between">
            <div class="font-mono text-xs font-bold text-base-content/80 truncate">{{ card.shortId }}…</div>
            <div class="flex items-center gap-1.5">
              <!-- Relay indicator -->
              <span
                v-if="card.relayCount > 0"
                class="badge badge-xs badge-warning gap-1"
                title="Relayed connections"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Relay
              </span>
              <span class="font-bold text-sm tabular-nums" :class="qualityColor(card.quality)">
                {{ card.quality }}
              </span>
            </div>
          </div>

          <!-- Quality bar -->
          <div class="w-full h-1 bg-base-300 rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-500"
              :class="qualityBg(card.quality)"
              :style="{ width: card.quality + '%' }"
            ></div>
          </div>

          <!-- Stats row -->
          <div class="grid grid-cols-3 gap-1 text-center">
            <div>
              <div class="text-[10px] text-base-content/40 uppercase tracking-wide">BW</div>
              <div class="text-xs font-mono font-semibold text-info">
                {{ formatBandwidth(card.totalBandwidth) }}
              </div>
            </div>
            <div>
              <div class="text-[10px] text-base-content/40 uppercase tracking-wide">Latency</div>
              <div class="text-xs font-mono font-semibold" :class="latencyColor(card.avgLatency)">
                {{ formatLatency(card.avgLatency) }}
              </div>
            </div>
            <div>
              <div class="text-[10px] text-base-content/40 uppercase tracking-wide">Loss</div>
              <div
                class="text-xs font-mono font-semibold"
                :class="card.packetLoss === 0 ? 'text-success' : card.packetLoss && card.packetLoss < 0.01 ? 'text-warning' : 'text-error'"
              >
                {{ formatLoss(card.packetLoss) }}
              </div>
            </div>
          </div>

          <!-- Latency sparkline -->
          <div v-if="card.latencyHistory.length >= 2" class="flex items-center gap-2">
            <span class="text-[10px] text-base-content/30 shrink-0">Hist</span>
            <svg viewBox="0 0 60 20" class="w-full h-4 overflow-visible" preserveAspectRatio="none">
              <path
                :d="sparklinePath(card.latencyHistory)"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="text-warning opacity-60"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
