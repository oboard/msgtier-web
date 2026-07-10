<script setup lang="ts">
///|
import { onMounted, ref, watch, computed, onUnmounted } from 'vue';
import * as d3 from 'd3';
import { apiData } from '../stores/data';
import type { Connection } from '../types/api';

const container = ref<HTMLDivElement | null>(null);
let svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;
let resizeObserver: ResizeObserver | null = null;

// Sequential blue ramp (reference palette, light→dark)
const SEQ_RAMP = [
  '#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef',
  '#6da7ec', '#5598e7', '#3987e5', '#2a78d6',
  '#256abf', '#1c5cab', '#184f95',
];

function isDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

///|
interface BarDatum {
  peerId: string;
  shortId: string;
  bandwidth: number;
}

const barData = computed<BarDatum[]>(() => {
  const d = apiData.value;
  if (!d) return [];

  return (d.peers ?? [])
    .map(p => ({
      peerId: p.id,
      shortId: p.id.slice(0, 8),
      bandwidth: p.connections.reduce(
        (s: number, c: Connection) => s + (c.bandwidth_mbps || 0),
        0,
      ),
    }))
    .filter(b => b.bandwidth > 0)
    .sort((a, b) => b.bandwidth - a.bandwidth);
});

///|
const tooltip = ref<{ visible: boolean; x: number; y: number; label: string; value: string }>({
  visible: false, x: 0, y: 0, label: '', value: '',
});

///|
function buildAndUpdate(): void {
  if (!container.value) return;
  d3.select(container.value).selectAll('*').remove();

  const data = barData.value;
  if (data.length === 0) {
    d3.select(container.value)
      .append('div')
      .attr('class', 'flex items-center justify-center h-16 text-xs opacity-30 italic')
      .text('No bandwidth data');
    return;
  }

  const box = container.value.getBoundingClientRect();
  const W = box.width || 500;
  const barH = 26;
  const gap = 6;
  const M = { top: 4, right: 64, bottom: 28, left: 80 };
  const H = M.top + data.length * (barH + gap) - gap + M.bottom;
  const w = W - M.left - M.right;
  const h = H - M.top - M.bottom;

  svg = d3
    .select(container.value)
    .append('svg')
    .attr('width', W)
    .attr('height', H)
    .attr('class', 'block');

  const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

  const xMax = d3.max(data, d => d.bandwidth) ?? 1;
  const xScale = d3.scaleLinear().domain([0, xMax * 1.08]).range([0, w]);
  const yScale = d3.scaleBand()
    .domain(data.map(d => d.shortId))
    .range([0, h])
    .padding(0.22);

  // Gridlines
  const gridColor = isDark() ? '#2c2c2a' : '#e1e0d9';
  const axisColor = 'oklch(50% 0 0)';

  g.append('g')
    .attr('class', 'gridlines')
    .selectAll('line')
    .data(xScale.ticks(4))
    .join('line')
    .attr('x1', d => xScale(d)).attr('x2', d => xScale(d))
    .attr('y1', 0).attr('y2', h)
    .attr('stroke', gridColor)
    .attr('stroke-width', 1);

  // X axis
  g.append('g')
    .attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(xScale).ticks(4).tickFormat(d => `${d}Mb`))
    .call(ax => {
      ax.selectAll('text').attr('fill', axisColor).style('font-size', '11px');
      ax.selectAll('path, line').attr('stroke', gridColor);
    });

  // Y axis (peer IDs)
  g.append('g')
    .call(d3.axisLeft(yScale).tickSize(0).tickPadding(8))
    .call(ax => {
      ax.selectAll('text')
        .attr('fill', axisColor)
        .style('font-size', '11px')
        .style('font-family', 'monospace');
      ax.select('.domain').remove();
    });

  // Sequential color — map bandwidth magnitude to ramp
  const colorScale = d3.scaleQuantize<string>()
    .domain([0, xMax])
    .range(isDark() ? SEQ_RAMP.slice(4) : SEQ_RAMP.slice(2, 9));

  // Bars with rounded right ends
  const barsG = g.append('g');
  data.forEach(d => {
    const bw = xScale(d.bandwidth);
    const by = yScale(d.shortId)!;
    const bh = yScale.bandwidth();
    const r = 4;

    barsG
      .append('path')
      .attr('d', `
        M 0 ${by}
        h ${Math.max(0, bw - r)}
        q ${r} 0 ${r} ${r}
        v ${bh - 2 * r}
        q 0 ${r} ${-r} ${r}
        H 0 Z
      `)
      .attr('fill', colorScale(d.bandwidth))
      .attr('cursor', 'pointer')
      .on('pointerenter', (event: PointerEvent) => {
        const rect = container.value!.getBoundingClientRect();
        tooltip.value = {
          visible: true,
          x: event.clientX - rect.left + 8,
          y: event.clientY - rect.top - 8,
          label: d.peerId.slice(0, 12) + '…',
          value: d.bandwidth < 1
            ? `${(d.bandwidth * 1000).toFixed(1)} Kbps`
            : `${d.bandwidth.toFixed(2)} Mbps`,
        };
      })
      .on('pointerleave', () => {
        tooltip.value = { ...tooltip.value, visible: false };
      });

    // Direct value label
    barsG
      .append('text')
      .attr('x', bw + 6)
      .attr('y', by + bh / 2 + 4)
      .attr('fill', axisColor)
      .style('font-size', '11px')
      .style('font-family', 'monospace')
      .text(
        d.bandwidth < 1
          ? `${(d.bandwidth * 1000).toFixed(0)}K`
          : `${d.bandwidth.toFixed(1)}M`,
      );
  });
}

///|
onMounted(() => {
  buildAndUpdate();
  resizeObserver = new ResizeObserver(() => buildAndUpdate());
  if (container.value) resizeObserver.observe(container.value);
});

watch(barData, () => buildAndUpdate());

onUnmounted(() => {
  resizeObserver?.disconnect();
});
</script>

<template>
  <div class="card bg-base-100 border border-base-200 rounded-xl overflow-visible">
    <div class="card-body p-4 gap-3">
      <!-- Header -->
      <div class="flex items-center gap-2">
        <div class="p-2 bg-info/10 rounded-lg text-info">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24"
            stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <div>
          <h3 class="font-bold text-sm">Bandwidth per Peer</h3>
          <p class="text-xs text-base-content/50">Current throughput (Mbps)</p>
        </div>
      </div>

      <!-- Chart -->
      <div class="relative w-full">
        <div ref="container" class="w-full min-h-[60px]"></div>

        <!-- HTML tooltip -->
        <div
          v-if="tooltip.visible"
          class="pointer-events-none absolute z-10 bg-base-200 border border-base-300 rounded-lg shadow-lg px-3 py-2 text-xs"
          :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
        >
          <div class="font-mono text-base-content/60 mb-0.5">{{ tooltip.label }}</div>
          <div class="font-mono font-bold text-base-content">{{ tooltip.value }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
