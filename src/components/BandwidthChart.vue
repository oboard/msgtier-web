<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import * as d3 from 'd3';
import { apiData } from '../stores/data';

const container = ref<HTMLDivElement | null>(null);
let svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;
let chartData: Array<{time: Date, bandwidth: number}> = [];

const maxDataPoints = 30;

function initializeChart() {
  if (!container.value) return;

  const margin = {top: 20, right: 30, bottom: 40, left: 50};
  const width = 500 - margin.left - margin.right;
  const height = 300 - margin.top - margin.bottom;
  
  // Clear any existing SVG
  d3.select(container.value).selectAll('*').remove();
  
  // Wrap in a card structure
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
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .attr('class', 'w-full h-full');
    
  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);
    
  // Add axes
  g.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${height})`);
    
  g.append('g')
    .attr('class', 'y-axis');
    
  // Add labels
  g.append('text')
    .attr('class', 'axis-label')
    .attr('transform', 'rotate(-90)')
    .attr('y', 0 - margin.left)
    .attr('x', 0 - (height / 2))
    .attr('dy', '1em')
    .style('text-anchor', 'middle')
    .style('fill', 'currentColor')
    .style('opacity', '0.6')
    .text('Bandwidth (Mbps)');
}

function updateChart() {
  const data = apiData.value;
  if (!data || !svg) return;
  
  // Get connections from the peer list for the local node
  const connections = (data.peers?.find(p => p.id === data.peer_id)?.connections) || [];
  
  const totalBandwidth = connections.reduce((sum, conn) => sum + (conn.bandwidth_mbps || 0), 0);
  
  // Add new data point
  chartData.push({
    time: new Date(),
    bandwidth: totalBandwidth
  });
  
  // Keep only recent data points
  if (chartData.length > maxDataPoints) {
    chartData = chartData.slice(-maxDataPoints);
  }
  
  const margin = {top: 20, right: 30, bottom: 40, left: 50};
  const width = 500 - margin.left - margin.right;
  const height = 300 - margin.top - margin.bottom;
  
  const xScale = d3.scaleTime()
    .domain(d3.extent(chartData, (d: {time: Date}) => d.time) as [Date, Date])
    .range([0, width]);
    
  const yScale = d3.scaleLinear()
    .domain([0, d3.max(chartData, (d: {bandwidth: number}) => d.bandwidth) || 1])
    .range([height, 0]);
  
  const line = d3.line<{time: Date, bandwidth: number}>()
    .x(d => xScale(d.time))
    .y(d => yScale(d.bandwidth))
    .curve(d3.curveMonotoneX);
  
  const g = svg.select('g');
  
  // Update axes
  g.select('.x-axis')
    .transition()
    .duration(500)
    .call(d3.axisBottom(xScale).tickFormat(d3.timeFormat('%H:%M:%S') as any) as any);
    
  g.select('.y-axis')
    .transition()
    .duration(500)
    .call(d3.axisLeft(yScale) as any);
  
  // Update line
  const path = g.selectAll('.line')
    .data([chartData]);
    
  (path.enter()
    .append('path')
    .attr('class', 'line')
    .attr('fill', 'none')
    .attr('stroke', '#3B82F6')
    .attr('stroke-width', 2)
    .merge(path as any) as any)
    .transition()
    .duration(500)
    .attr('d', line);
}

onMounted(() => {
  initializeChart();
  if (apiData.value) {
    updateChart();
  }
});

watch(apiData, (newData) => {
  if (newData) {
    updateChart();
  }
});
</script>

<template>
<div class="card bg-base-100">
  <div class="card-body">
    <h2 class="card-title">Bandwidth Over Time</h2>
    <div ref="container" class="flex justify-center"></div>
  </div>
</div>
</template>
