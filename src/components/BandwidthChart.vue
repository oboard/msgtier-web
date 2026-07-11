<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import * as d3 from 'd3';
import { apiData } from '../stores/data';

const container = ref<HTMLDivElement | null>(null);
let svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;
let gEl: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
let chartData: Array<{ time: Date, bandwidth: number }> = [];

let animFrameId: number | null = null;
let lastYMax = 1;

const maxDataPoints = 60;
const WINDOW_MS = 30 * 1000; // 显示最近 30 秒
const margin = { top: 20, right: 30, bottom: 40, left: 50 };
const CHART_WIDTH = 500 - margin.left - margin.right;
const CHART_HEIGHT = 300 - margin.top - margin.bottom;

function initializeChart() {
  if (!container.value) return;

  d3.select(container.value).selectAll('*').remove();

  const wrapper = d3.select(container.value)
    .attr('class', 'card bg-base-100 border border-base-300 rounded-box h-full')
    .append('div')
    .attr('class', 'card-body p-4');

  wrapper.append('h3')
    .attr('class', 'card-title text-base-content/80 mb-4 text-sm')
    .text('Bandwidth History');

  const svgContainer = wrapper.append('div')
    .attr('class', 'w-full h-[300px] flex justify-center items-center bg-base-200/30 rounded-lg overflow-hidden');

  svg = svgContainer
    .append('svg')
    .attr('width', CHART_WIDTH + margin.left + margin.right)
    .attr('height', CHART_HEIGHT + margin.top + margin.bottom)
    .attr('viewBox', `0 0 ${CHART_WIDTH + margin.left + margin.right} ${CHART_HEIGHT + margin.top + margin.bottom}`)
    .attr('class', 'w-full h-full');

  // 裁剪区域，防止曲线溢出到坐标轴外
  svg.append('defs')
    .append('clipPath')
    .attr('id', 'bw-clip')
    .append('rect')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', CHART_WIDTH)
    .attr('height', CHART_HEIGHT);

  gEl = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  gEl.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${CHART_HEIGHT})`);

  gEl.append('g')
    .attr('class', 'y-axis');

  gEl.append('path')
    .attr('class', 'line')
    .attr('fill', 'none')
    .attr('stroke', '#3B82F6')
    .attr('stroke-width', 2)
    .attr('clip-path', 'url(#bw-clip)');

  gEl.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('y', 0 - margin.left)
    .attr('x', 0 - (CHART_HEIGHT / 2))
    .attr('dy', '1em')
    .style('text-anchor', 'middle')
    .style('fill', 'currentColor')
    .style('opacity', '0.6')
    .text('Bandwidth (Mbps)');
}

// 每帧渲染：只推进 x 轴时间窗口，数据点的 bandwidth (y) 不变
function renderFrame() {
  if (!gEl || chartData.length < 1) {
    animFrameId = requestAnimationFrame(renderFrame);
    return;
  }

  const now = Date.now();
  const windowStart = new Date(now - WINDOW_MS);
  const windowEnd = new Date(now);

  const xScale = d3.scaleTime()
    .domain([windowStart, windowEnd])
    .range([0, CHART_WIDTH]);

  const yMax = d3.max(chartData, d => d.bandwidth) || 1;

  // y 轴有变化时用短动画过渡，避免每帧抖动
  if (yMax !== lastYMax) {
    lastYMax = yMax;
    const yScale = d3.scaleLinear()
      .domain([0, yMax]).nice()
      .range([CHART_HEIGHT, 0]);
    gEl.select<SVGGElement>('.y-axis')
      .transition().duration(200)
      .call(d3.axisLeft(yScale) as any);
  }

  const yScale = d3.scaleLinear()
    .domain([0, lastYMax]).nice()
    .range([CHART_HEIGHT, 0]);

  const line = d3.line<{ time: Date, bandwidth: number }>()
    .x(d => xScale(d.time))
    .y(d => yScale(d.bandwidth))
    .curve(d3.curveMonotoneX);

  // x 轴每帧直接更新（时间连续推进，不需要动画）
  gEl.select<SVGGElement>('.x-axis')
    .call(
      d3.axisBottom(xScale)
        .tickFormat(d3.timeFormat('%H:%M:%S') as any)
        .ticks(5) as any
    );

  // 曲线直接更新路径（x 轴推进使曲线自然向左流动）
  gEl.select<SVGPathElement>('.line')
    .attr('d', line(chartData));

  animFrameId = requestAnimationFrame(renderFrame);
}

function addDataPoint() {
  const data = apiData.value;
  if (!data) return;

  const connections = (data.peers?.find(p => p.id === data.peer_id)?.connections) || [];
  const totalBandwidth = connections.reduce((sum, conn) => sum + (conn.bandwidth_mbps || 0), 0);

  chartData.push({ time: new Date(), bandwidth: totalBandwidth });

  if (chartData.length > maxDataPoints) {
    chartData = chartData.slice(-maxDataPoints);
  }
}

onMounted(() => {
  initializeChart();
  addDataPoint();
  animFrameId = requestAnimationFrame(renderFrame);
});

onUnmounted(() => {
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
  }
});

watch(apiData, (newData) => {
  if (newData) {
    addDataPoint();
  }
});
</script>

<template>
  <div ref="container" class="flex justify-center"></div>
</template>
