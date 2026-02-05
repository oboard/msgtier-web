<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import * as d3 from "d3";
import { apiData } from "../stores/data";
import type { ApiResponse } from "../types/api";

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  type: "self" | "peer";
  active: boolean;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  active: boolean;
  bandwidth: number;
  latency: number;
}

const container = ref<HTMLDivElement | null>(null);
let svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;
let graphGroup: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
let simulation: d3.Simulation<GraphNode, GraphLink> | null = null;

let width = 800;
let height = 600;
let svgContainerElement: HTMLDivElement | null = null;

let resizeObserver: ResizeObserver | null = null;

// Store node positions map to preserve them across updates
const nodePositions = new Map<
  string,
  { x: number; y: number; vx: number; vy: number }
>();

function initializeGraph() {
  if (!container.value) return;

  // Clear any existing SVG
  d3.select(container.value).selectAll("*").remove();

  // Wrap in a card structure
  const wrapper = d3
    .select(container.value)
    .attr(
      "class",
      "card bg-base-100 shadow-sm border border-base-300 rounded-box h-full",
    )
    .append("div")
    .attr("class", "card-body p-4");

  wrapper
    .append("h3")
    .attr("class", "card-title text-base-content/80 mb-4 text-sm")
    .text("Network Topology");

  const svgContainer = wrapper
    .append("div")
    .attr(
      "class",
      "w-full h-[600px] flex justify-center items-center bg-base-200/30 rounded-lg overflow-hidden relative",
    );

  // Bind the element for ResizeObserver
  svgContainerElement = svgContainer.node() as HTMLDivElement;
  // Initialize width/height
  width = svgContainerElement.clientWidth;
  height = svgContainerElement.clientHeight;

  svg = svgContainer
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("class", "w-full h-full");

  // Add gradients and filters
  const defs = svg.append("defs");

  // Grid pattern
  const pattern = defs
    .append("pattern")
    .attr("id", "grid")
    .attr("width", 40)
    .attr("height", 40)
    .attr("patternUnits", "userSpaceOnUse");

  pattern
    .append("path")
    .attr("d", "M 40 0 L 0 0 0 40")
    .attr("fill", "none")
    .attr("stroke", "currentColor")
    .attr("stroke-width", 0.5)
    .attr("class", "text-base-content/5");

  // Glow filter for active nodes/links
  const filter = defs.append("filter").attr("id", "glow");
  filter
    .append("feGaussianBlur")
    .attr("stdDeviation", "2.5")
    .attr("result", "coloredBlur");
  const feMerge = filter.append("feMerge");
  feMerge.append("feMergeNode").attr("in", "coloredBlur");
  feMerge.append("feMergeNode").attr("in", "SourceGraphic");

  // Gradient for Self Node
  const selfGradient = defs
    .append("radialGradient")
    .attr("id", "grad-self")
    .attr("cx", "50%")
    .attr("cy", "50%")
    .attr("r", "50%");
  selfGradient
    .append("stop")
    .attr("offset", "0%")
    .attr("stop-color", "#60A5FA"); // blue-400
  selfGradient
    .append("stop")
    .attr("offset", "100%")
    .attr("stop-color", "#2563EB"); // blue-600

  // Gradient for Active Peer
  const activeGradient = defs
    .append("radialGradient")
    .attr("id", "grad-active")
    .attr("cx", "50%")
    .attr("cy", "50%")
    .attr("r", "50%");
  activeGradient
    .append("stop")
    .attr("offset", "0%")
    .attr("stop-color", "#34D399"); // emerald-400
  activeGradient
    .append("stop")
    .attr("offset", "100%")
    .attr("stop-color", "#059669"); // emerald-600

  // Gradient for Inactive Peer
  const inactiveGradient = defs
    .append("radialGradient")
    .attr("id", "grad-inactive")
    .attr("cx", "50%")
    .attr("cy", "50%")
    .attr("r", "50%");
  inactiveGradient
    .append("stop")
    .attr("offset", "0%")
    .attr("stop-color", "#9CA3AF"); // gray-400
  inactiveGradient
    .append("stop")
    .attr("offset", "100%")
    .attr("stop-color", "#4B5563"); // gray-600

  svg
    .append("rect")
    .attr("width", "100%")
    .attr("height", "100%")
    .attr("fill", "url(#grid)");

  // Create main container group for zoom/pan
  graphGroup = svg.append("g").attr("class", "graph-container");

  // Create groups in specific order inside the container
  graphGroup.append("g").attr("class", "links");
  graphGroup.append("g").attr("class", "nodes");
  graphGroup.append("g").attr("class", "labels");

  // Add Zoom behavior
  const zoom = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.1, 4])
    .on("zoom", (event) => {
      if (graphGroup) {
        graphGroup.attr("transform", event.transform);
      }
    });

  svg.call(zoom).on("dblclick.zoom", null); // Disable double click zoom

  simulation = d3
    .forceSimulation<GraphNode, GraphLink>()
    .force(
      "link",
      d3
        .forceLink<GraphNode, GraphLink>()
        .id((d) => d.id)
        .distance(150),
    ) // Increased distance
    .force("charge", d3.forceManyBody().strength(-800)) // Stronger repulsion
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force(
      "collide",
      d3
        .forceCollide<GraphNode>()
        .radius((d) => (d.type === "self" ? 35 : 25) + 10)
        .strength(0.7),
    ); // Prevent overlap

  // Handle window resize
  resizeObserver = new ResizeObserver((entries) => {
    for (let entry of entries) {
      width = entry.contentRect.width;
      height = entry.contentRect.height;
      if (svg) {
        svg
          .attr("width", width)
          .attr("height", height)
          .attr("viewBox", `0 0 ${width} ${height}`);
      }
      
      if (simulation) {
         simulation.force("center", d3.forceCenter(width / 2, height / 2));
         simulation.alpha(0.3).restart();
      }
    }
  });

  if (svgContainerElement) {
    resizeObserver.observe(svgContainerElement);
  }
}

function updateGraph(data: ApiResponse) {
  if (!svg || !simulation || !graphGroup) return;

  // Save current positions
  simulation.nodes().forEach((node) => {
    if (node.x !== undefined && node.y !== undefined) {
      nodePositions.set(node.id, {
        x: node.x,
        y: node.y,
        vx: node.vx || 0,
        vy: node.vy || 0,
      });
    }
  });

  // Create nodes and links from the data
  const newNodes: GraphNode[] = data.peers.map((peer) => {
    const isSelf = peer.id === data.peer_id;
    return {
      id: peer.id,
      name: peer.id,
      type: isSelf ? "self" : "peer",
      active: (peer.connections || []).some(
        (c) => c.state === "Connected" || c.active,
      ),
      // Fix self node in the center
      fx: isSelf ? width / 2 : undefined,
      fy: isSelf ? height / 2 : undefined,
    };
  });

  // Restore positions for existing nodes
  newNodes.forEach((node) => {
    // Don't restore position for self node as it's fixed
    if (node.type === "self") return;

    const savedPos = nodePositions.get(node.id);
    if (savedPos) {
      node.x = savedPos.x;
      node.y = savedPos.y;
      node.vx = savedPos.vx;
      node.vy = savedPos.vy;
    }
  });

  const newLinks: GraphLink[] = [];
  const processedLinks = new Set<string>();

  data.peers.forEach((peer) => {
    if (!peer.connections) return;

    peer.connections.forEach((conn) => {
      // Use sorted IDs to deduplicate undirected edges
      // If we want to show directionality later, we'd remove the sort
      const sourceId = peer.id;
      const targetId = conn.peer_id;

      // Skip self-loops if any
      if (sourceId === targetId) return;

      const linkId = [sourceId, targetId].sort().join("-");

      if (processedLinks.has(linkId)) return;

      newLinks.push({
        source: sourceId,
        target: targetId,
        active: conn.state === "Connected" || conn.active === true,
        bandwidth: conn.bandwidth_mbps || 0,
        latency: conn.latency_ms || 0,
      });

      processedLinks.add(linkId);
    });
  });

  // Select groups
  let linkGroup = graphGroup.select<SVGGElement>(".links");
  let nodeGroup = graphGroup.select<SVGGElement>(".nodes");
  let labelGroup = graphGroup.select<SVGGElement>(".labels");

  // Update links
  const link = linkGroup
    .selectAll<SVGLineElement, GraphLink>("line")
    .data(
      newLinks,
      (d: any) => `${d.source.id || d.source}-${d.target.id || d.target}`,
    );

  link.exit().remove();

  const linkEnter = link.enter().append("line").attr("stroke-opacity", 0.8);

  const linkMerge = linkEnter
    .merge(link)
    .attr("stroke", (d) => (d.active ? "#10B981" : "#EF4444"))
    .attr("stroke-width", (d) => Math.max(1, d.bandwidth * 2))
    .attr("stroke-dasharray", (d) => (d.active ? null : "4,4")) // Dashed for inactive
    .attr("filter", (d) => (d.active ? "url(#glow)" : null)); // Glow for active

  linkMerge.select("title").remove();
  linkMerge
    .append("title")
    .text(
      (d) =>
        `Bandwidth: ${d.bandwidth.toFixed(3)} Mbps\nLatency: ${d.latency}ms`,
    );

  // Update nodes
  const node = nodeGroup
    .selectAll<SVGCircleElement, GraphNode>("circle")
    .data(newNodes, (d) => d.id);

  node.exit().remove();

  const nodeEnter = node
    .enter()
    .append("circle")
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 2);

  const nodeMerge = nodeEnter
    .merge(node)
    .attr("r", (d) => (d.type === "self" ? 25 : 18)) // Increased size
    .attr("fill", (d) => {
      if (d.type === "self") return "url(#grad-self)";
      return d.active ? "url(#grad-active)" : "url(#grad-inactive)";
    })
    .attr("filter", (d) =>
      d.type === "self" || d.active ? "url(#glow)" : null,
    ); // Glow for active/self

  nodeMerge.select("title").remove();
  nodeMerge
    .append("title")
    .text(
      (d) => `${d.name} (${d.type}) - ${d.active ? "Active" : "Inactive"}`,
    );

  // Update labels
  const label = labelGroup
    .selectAll<SVGTextElement, GraphNode>("text")
    .data(newNodes, (d) => d.id);

  label.exit().remove();

  const labelEnter = label
    .enter()
    .append("text")
    .attr("font-size", "12px")
    .attr("fill", "currentColor")
    .attr("class", "text-base-content fill-current")
    .attr("text-anchor", "middle")
    .attr("dy", "2.5em"); // Moved below the node

  const labelMerge = labelEnter.merge(label).text((d) => d.name);

  // Update simulation
  simulation.nodes(newNodes);
  simulation
    .force<d3.ForceLink<GraphNode, GraphLink>>("link")
    ?.links(newLinks);

  simulation.on("tick", () => {
    // Clamp nodes to canvas bounds with padding
    newNodes.forEach((d) => {
      // Skip clamping for fixed nodes (like self node) if desired,
      // but here we ensure everything stays in bounds.
      // Self node is fixed at center, so it should be fine.

      const r = d.type === "self" ? 25 : 18;
      const padding = 20;

      if (d.x !== undefined) {
        d.x = Math.max(r + padding, Math.min(width - r - padding, d.x));
      }
      if (d.y !== undefined) {
        d.y = Math.max(r + padding, Math.min(height - r - padding, d.y));
      }
    });

    linkMerge
      .attr("x1", (d) => (d.source as GraphNode).x!)
      .attr("y1", (d) => (d.source as GraphNode).y!)
      .attr("x2", (d) => (d.target as GraphNode).x!)
      .attr("y2", (d) => (d.target as GraphNode).y!);

    nodeMerge.attr("cx", (d) => d.x!).attr("cy", (d) => d.y!);

    labelMerge.attr("x", (d) => d.x!).attr("y", (d) => d.y!);
  });

  // Only restart alpha if significant changes or first run, otherwise keep it warm
  // For smooth updates, we usually want to reheat the simulation slightly but not full restart
  // If we have preserved positions, use a lower alpha target
  if (simulation.alpha() < 0.1) {
    simulation.alpha(0.3).restart();
  }
}

onMounted(() => {
  initializeGraph();
  if (apiData.value) {
    updateGraph(apiData.value);
  }
});

onUnmounted(() => {
  if (simulation) {
    simulation.stop();
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
});

watch(apiData, (newData) => {
  if (newData) {
    updateGraph(newData);
  }
});
</script>

<template>
  <div ref="container" class="h-full"></div>
</template>
