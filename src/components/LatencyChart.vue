<script setup lang="ts">
///|
import { onMounted, ref, watch, onUnmounted } from 'vue';
import * as d3 from 'd3';
import { apiData } from '../stores/data';
import type { Connection } from '../types/api';

const container = ref<HTMLDivElement | null>(null);

// Rolling per-peer latency history: peer_id → last 30 samples
const peerHistory = ref<Record<string, number[]>>({});

// D3 selections kept across updates
let svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;
let gMain: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
let resizeObserver: ResizeObserver | null = null;

const MAX_POINTS = 30;

// Categorical palette slots 1-6 (reference palette, validated)
const SERIES_COLORS_LIGHT = [
  '#2a78d6', '#1baf7a', '#eda100',
  '#4a3aa7', '#e34948', '#e87ba4',
];
const SERIES_COLORS_DARK = [
  '#3987e5', '#199e70', '#c98500',
  '#9085e9', '#e66767', '#d55181',
];

function isDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function seriesColor(i: number): string {
  const palette = isDark() ? SERIES_COLORS_DARK : SERIES_COLORS_LIGHT;
  return palette[i % palette.length];
}

///|
function collectLatency(): void {
  const d = apiData.value;
  if (!d) return;
  const myPeer = d.peers?.find(p => p.id === d.peer_id);
  if (!myPeer) return;

  myPeer.connections.forEach((c: Connection) => {
    const id = c.peer_id;
    const sample =
      c.latency_ms ??
      (c.latency_history?.length
        ? c.latency_history[c.latency_history.length - 1]
        : undefined);
    if (sample === undefined) return;

    if (!peerHistory.value[id]) {
      peerHistory.value[id] = [];
    }
    peerHistory.value[id].push(sample);
    if (peerHistory.value[id].length > MAX_POINTS) {
      peerHistory.value[id] = peerHistory.value[id].slice(-MAX_POINTS);
    }
  });
}

///|
function buildChart(): void {
  if (!container.value) return;
  const box = container.value.getBoundingClientRect();
  const W = box.width || 500;
  const H = 240;
  const M = { top: 12, right: 24, bottom: 36, left: 44 };
  const w = W - M.left - M.right;
  const h = H - M.top - M.bottom;

  d3.select(container.value).selectAll('*').remove();

  svg = d3
    .select(container.value)
    .append('svg')
    .attr('width', W)
    .attr('height', H)
    .attr('class', 'block');

  gMain = svg
    .append('g')
    .attr('transform', `translate(${M.left},${M.top})`);

  // Axes placeholders
  gMain.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${h})`);
  gMain.append('g').attr('class', 'y-axis');

  // Gridlines group
  gMain.append('g').attr('class', 'gridlines');

  // Lines group
  gMain.append('g').attr('class', 'lines');

  // Tooltip crosshair
  gMain
    .append('line')
    .attr('class', 'crosshair')
    .attr('y1', 0).attr('y2', h)
    .attr('stroke', 'currentColor')
    .attr('stroke-opacity', 0.3)
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '3,3')
    .style('display', 'none');

  // Invisible overlay for pointer events
  gMain
    .append('rect')
    .attr('class', 'overlay')
    .attr('width', w).attr('height', h)
    .attr('fill', 'none')
    .attr('pointer-events', 'all')
    .on('pointermove', onPointerMove)
    .on('pointerleave', onPointerLeave);
}

///|
function updateChart(): void {
  if (!svg || !gMain || !container.value) return;

  const peers = Object.keys(peerHistory.value);
  if (peers.length === 0) return;

  const box = container.value.getBoundingClientRect();
  const W = box.width || 500;
  const H = 240;
  const M = { top: 12, right: 24, bottom: 36, left: 44 };
  const w = W - M.left - M.right;
  const h = H - M.top - M.bottom;

  const allPoints = peers.flatMap(id =>
    peerHistory.value[id].map((v, i) => ({ x: i, y: v })),
  );

  const xDomain: [number, number] = [0, MAX_POINTS - 1];
  const yMax = d3.max(allPoints, d => d.y) ?? 1;
  const yDomain: [number, number] = [0, yMax * 1.1];

  const xScale = d3.scaleLinear().domain(xDomain).range([0, w]);
  const yScale = d3.scaleLinear().domain(yDomain).range([h, 0]);

  const axisColor = 'oklch(50% 0 0)';
  const gridColor = isDark() ? '#2c2c2a' : '#e1e0d9';

  // Gridlines
  gMain!.select('.gridlines')
    .selectAll('line')
    .data(yScale.ticks(4))
    .join('line')
    .attr('x1', 0).attr('x2', w)
    .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
    .attr('stroke', gridColor)
    .attr('stroke-width', 1);

  // X axis
  (gMain!.select('.x-axis') as d3.Selection<SVGGElement, unknown, null, undefined>)
    .transition().duration(300)
    .call(
      d3.axisBottom(xScale)
        .ticks(5)
        .tickFormat(d => `${(MAX_POINTS - 1 - (d as number)) * -1}s` as string)
    );

  // Y axis
  (gMain!.select('.y-axis') as d3.Selection<SVGGElement, unknown, null, undefined>)
    .transition().duration(300)
    .call(d3.axisLeft(yScale).ticks(4).tickFormat(d => `${d}ms`));

  // Style axis ticks
  gMain!.selectAll('.x-axis text, .y-axis text')
    .attr('fill', axisColor)
    .style('font-size', '11px');
  gMain!.selectAll('.x-axis path, .x-axis line, .y-axis path, .y-axis line')
    .attr('stroke', gridColor);

  // Draw one line per peer
  const line = d3
    .line<number>()
    .x((_, i) => xScale(i))
    .y(d => yScale(d))
    .curve(d3.curveMonotoneX);

  const linesG = gMain!.select('.lines');

  peers.forEach((id, idx) => {
    const history = peerHistory.value[id];
    const color = seriesColor(idx);

    let path = linesG.select<SVGPathElement>(`.line-${idx}`);
    if (path.empty()) {
      path = linesG
        .append('path')
        .attr('class', `line-${idx}`)
        .attr('fill', 'none')
        .attr('stroke-width', 2)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round');
    }
    (path.transition().duration(300) as any)
      .attr('stroke', color)
      .attr('d', line(history));
  });

  // Remove stale lines
  linesG.selectAll<SVGPathElement, unknown>('path').each(function (_, i) {
    if (i >= peers.length) d3.select(this).remove();
  });
}

///|
// Tooltip state
const tooltip = ref<{ visible: boolean; x: number; y: number; items: { label: string; color: string; value: string }[] }>({
  visible: false, x: 0, y: 0, items: [],
});

function onPointerMove(event: PointerEvent): void {
  if (!container.value || !gMain) return;
  const M = { left: 44 };
  const rect = container.value.getBoundingClientRect();
  const xPx = event.clientX - rect.left - M.left;
  const w = rect.width - M.left - 24;
  const idx = Math.round((xPx / w) * (MAX_POINTS - 1));
  const clampedIdx = Math.max(0, Math.min(MAX_POINTS - 1, idx));

  const peers = Object.keys(peerHistory.value);
  const items = peers.flatMap((id, i) => {
    const v = peerHistory.value[id][clampedIdx];
    if (v === undefined) return [];
    return [{ label: id.slice(0, 8) + '…', color: seriesColor(i), value: `${v.toFixed(1)} ms` }];
  });

  const xScale = d3.scaleLinear().domain([0, MAX_POINTS - 1]).range([0, w]);
  gMain.select('.crosshair')
    .style('display', null)
    .attr('x1', xScale(clampedIdx))
    .attr('x2', xScale(clampedIdx));

  tooltip.value = {
    visible: items.length > 0,
    x: event.clientX - rect.left + 8,
    y: event.clientY - rect.top - 8,
    items,
  };
}

function onPointerLeave(): void {
  gMain?.select('.crosshair').style('display', 'none');
  tooltip.value = { visible: false, x: 0, y: 0, items: [] };
}

///|
onMounted(() => {
  buildChart();
  collectLatency();
  updateChart();

  resizeObserver = new ResizeObserver(() => {
    buildChart();
    updateChart();
  });
  if (container.value) resizeObserver.observe(container.value);
});

watch(apiData, () => {
  collectLatency();
  updateChart();
});

onUnmounted(() => {
  resizeObserver?.disconnect();
});
</script>

<template>
  <div class="card bg-base-100 border border-base-200 rounded-xl overflow-visible">
    <div class="card-body p-4 gap-3">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="p-2 bg-warning/10 rounded-lg text-warning">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24"
              stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <div>
            <h3 class="font-bold text-sm">Latency History</h3>
            <p class="text-xs text-base-content/50">Per-peer round-trip (ms)</p>
          </div>
        </div>
        <!-- Legend -->
        <div class="flex flex-wrap gap-x-3 gap-y-1 justify-end">
          <div
            v-for="(id, i) in Object.keys(peerHistory)"
            :key="id"
            class="flex items-center gap-1 text-xs text-base-content/70"
          >
            <span
              class="inline-block w-3 h-0.5 rounded-full"
              :style="{ background: $data ? seriesColor(i) : '#888' }"
            ></span>
            <span class="font-mono">{{ id.slice(0, 6) }}…</span>
          </div>
          <div v-if="Object.keys(peerHistory).length === 0" class="text-xs text-base-content/30 italic">
            Waiting for data…
          </div>
        </div>
      </div>

      <!-- Chart -->
      <div class="relative w-full">
        <div ref="container" class="w-full"></div>

        <!-- HTML tooltip -->
        <div
          v-if="tooltip.visible"
          class="pointer-events-none absolute z-10 bg-base-200 border border-base-300 rounded-lg shadow-lg px-3 py-2 text-xs"
          :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
        >
          <div v-for="item in tooltip.items" :key="item.label" class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full flex-shrink-0" :style="{ background: item.color }"></span>
            <span class="font-mono text-base-content/60">{{ item.label }}</span>
            <span class="font-mono font-bold ml-auto pl-4">{{ item.value }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
