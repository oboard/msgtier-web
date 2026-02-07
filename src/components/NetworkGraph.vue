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
  id: string; // Unique ID for D3 key
  source: string | GraphNode;
  target: string | GraphNode;
  active: boolean;
  bandwidth: number;
  latency: number;
  remote_addr: string;
  curvatureOffset: number;
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
  graphGroup.append("g").attr("class", "link-labels");
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
        .distance(600), // Increased distance
    )
    .force("charge", d3.forceManyBody().strength(-4000)) // Stronger repulsion
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force(
      "radial",
      d3
        .forceRadial(300, width / 2, height / 2) // Increased radius to avoid clumping
        .strength(0.05) // Reduced strength
    ) // Gentle gravity towards center
    .force(
      "collide",
      d3
        .forceCollide<GraphNode>()
        .radius((d) => (d.type === "self" ? 35 : 25) + 400) // Increased collision radius for labels
        .strength(0.7),
    );

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
        simulation.force("radial", d3.forceRadial(300, width / 2, height / 2).strength(0.05));
        simulation.alpha(0.3).restart();
      }
    }
  });

  if (svgContainerElement) {
    resizeObserver.observe(svgContainerElement);
  }
}

function formatAddress(addr: string): string {
  if (!addr) return "Unknown";

  // Try to parse multiaddr
  if (addr.startsWith("/")) {
    const parts = addr.split("/").filter((p) => p);
    // Common parts: ['ip4', '1.2.3.4', 'tcp', '8080']

    let ip = "";
    let port = "";
    let protocol = "";

    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === "ip4" || parts[i] === "ip6") {
        ip = parts[i + 1];
        i++;
      } else if (["tcp", "udp", "quic", "ws", "wss"].includes(parts[i])) {
        protocol = protocol ? `${protocol}/${parts[i]}` : parts[i];
        if (parts[i + 1] && /^\d+$/.test(parts[i + 1])) {
          port = parts[i + 1];
          i++;
        }
      }
    }

    if (ip) {
      return `${ip}${port ? `:${port}` : ""} ${protocol ? `(${protocol})` : ""}`;
    }
  }

  return addr;
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

  // Check if topology has changed
  // Simple check: compare node IDs and link IDs
  const currentNodeIds = new Set(simulation.nodes().map(n => n.id));
  const newNodeIds = new Set(data.peers.map(p => p.id));
  const nodesChanged = currentNodeIds.size !== newNodeIds.size || [...currentNodeIds].some(id => !newNodeIds.has(id));

  // Note: We are regenerating links every time, so link IDs might change if we merge them differently.
  // But if the underlying data structure is stable, our merge logic should be deterministic.
  // Let's assume nodes stability is the main factor for "jitter".

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

  // Group links by source-target pair to calculate curvature
  const linkGroups = new Map<string, any[]>();

  data.peers.forEach((peer) => {
    if (!peer.connections) return;

    peer.connections.forEach((conn, index) => {
      const sourceId = peer.id;
      const targetId = conn.peer_id;

      // Skip self-loops if any
      if (sourceId === targetId) return;

      // Create a key that is consistent regardless of direction if we want to bundle them together
      // Use a separator that is unlikely to be in the ID (like '|||')
      const key = [sourceId, targetId].sort().join("|||");

      if (!linkGroups.has(key)) {
        linkGroups.set(key, []);
      }

      linkGroups.get(key)!.push({
        source: sourceId,
        target: targetId,
        active: conn.state === "Connected" || conn.active === true,
        bandwidth: conn.bandwidth_mbps || 0,
        latency: conn.latency_ms || (conn.latency_history?.length ? conn.latency_history[conn.latency_history.length - 1] : 0),
        remote_addr: conn.remote_addr,
        id: `${sourceId}-${targetId}-${index}` // Unique ID
      });
    });
  });

  // Process groups and assign indices
  linkGroups.forEach((links, key) => {
    // Determine canonical source for the pair from the key (e.g., sorted IDs)
    const [id1, id2] = key.split("|||");

    const forward = links.filter((l) => l.source === id1);
    const reverse = links.filter((l) => l.source === id2);

    // If bidirectional, merge mirrored connections (simple approximation for now)
    // Actually, user wants them MERGED into one line if bidirectional.
    // So if isBidirectional is true, we should merge matching pairs?
    // Or just merge everything into one line? 
    // "If it is a bidirectional connection it should be merged into one line"
    // Let's assume this means: If A->B and B->A exist, show ONE line.

    // Simplification strategy:
    // If isBidirectional, we take all links and try to pair them up.
    // However, finding exact pairs (port matching) is complex without local port info on both sides fully available in one context easily.
    // Let's just group them all and assign curvature.

    // BUT, the user explicitly said "merged into one line".
    // If we have multiple connections (e.g. TCP + UDP), we should keep them separate?
    // "Two peer connected... tilt angle... text cannot overlap" -> This implies multiple lines are desired if multiple protocols.
    // But "If it is a bidirectional connection it should be merged into one line" -> Maybe means for the SAME protocol/connection.

    // Let's try to detect mirrors based on protocol/address if possible, OR just rely on the fact that we have multiple links.
    // Given the user complaint "still too close" and "merged into one line", maybe they want a simpler graph?

    // Let's stick to the "Right Hand Traffic" but with a modification:
    // If we detect a mirror (same connection ID logic?), merge them.
    // The current IDs are like "oboard-mac:tcp://...:tcp://...".
    // Let's just create distinct links for unique connections.

    // Wait, the user said "If it is a bidirectional connection it should be merged into one line".
    // This implies 2 links -> 1 link.
    // So I will combine `forward` and `reverse` lists.
    // If I have 1 forward and 1 reverse, I output 1 link.

    // Let's try to match them.
    const mergedLinks: GraphLink[] = [];
    const processedReverseIndices = new Set<number>();

    forward.forEach(fLink => {
      // Try to find a matching reverse link
      // A match is likely same protocol? Or just any available reverse link?
      // Let's try to match by address if possible, but addresses are inverted.
      // fLink.remote_addr is B's address. rLink.remote_addr is A's address.
      // Hard to match exactly without more info.
      // Let's just greedily match one-to-one.

      const rIndex = reverse.findIndex((r, idx) => !processedReverseIndices.has(idx));

      if (rIndex !== -1) {
        // Found a match, merge them
        processedReverseIndices.add(rIndex);
        const rLink = reverse[rIndex];

        // Create a merged link
        mergedLinks.push({
          ...fLink,
          id: `merged-${fLink.id}-${rLink.id}`, // Combined ID
          isBidirectional: true,
          // Sum bandwidth? Average latency?
          bandwidth: fLink.bandwidth + rLink.bandwidth,
          latency: (fLink.latency + rLink.latency) / 2,
          // Display info?
          remote_addr: `${fLink.remote_addr} <-> ${rLink.remote_addr}` // Maybe too long?
          // Just keep one address for label or mark as bi-di
        });
      } else {
        // No match, keep as is
        mergedLinks.push(fLink);
      }
    });

    // Add remaining reverse links
    reverse.forEach((rLink, idx) => {
      if (!processedReverseIndices.has(idx)) {
        mergedLinks.push(rLink);
      }
    });

    // Now assign offsets to mergedLinks
    const n = mergedLinks.length;
    mergedLinks.forEach((link, i) => {
      const spacing = 60;
      // Center the group
      const offset = (i - (n - 1) / 2) * spacing;

      newLinks.push({
        ...link,
        curvatureOffset: offset,
      });
    });
  });

  // Select groups
  let linkGroup = graphGroup.select<SVGGElement>(".links");
  let linkLabelGroup = graphGroup.select<SVGGElement>(".link-labels");
  let nodeGroup = graphGroup.select<SVGGElement>(".nodes");
  let labelGroup = graphGroup.select<SVGGElement>(".labels");

  // Update links (PATHS instead of LINES)
  const link = linkGroup
    .selectAll<SVGPathElement, GraphLink>("path")
    .data(newLinks, (d) => d.id);

  link.exit().remove();

  const linkEnter = link.enter().append("path").attr("fill", "none").attr("stroke-opacity", 0.6);

  const linkMerge = linkEnter
    .merge(link)
    .attr("stroke", (d) => (d.active ? "#10B981" : "#EF4444"))
    .attr("stroke-width", (d) => Math.max(1.5, d.bandwidth * 2))
    .attr("stroke-dasharray", (d) => (d.active ? null : "4,4")) // Dashed for inactive
    .attr("filter", (d) => (d.active ? "url(#glow)" : null)); // Glow for active

  linkMerge.select("title").remove();
  linkMerge
    .append("title")
    .text(
      (d) =>
        `Remote: ${d.remote_addr}\nBandwidth: ${d.bandwidth.toFixed(3)} Mbps\nLatency: ${d.latency}ms`,
    );

  // Update link labels
  const linkLabel = linkLabelGroup
    .selectAll<SVGTextElement, GraphLink>("text")
    .data(newLinks, (d) => d.id);

  linkLabel.exit().remove();

  const linkLabelEnter = linkLabel.enter().append("text")
    .attr("font-family", "monospace")
    .attr("font-size", "10px")
    .attr("fill", "currentColor")
    .attr("class", "text-base-content/70")
    .attr("text-anchor", "middle")
    .attr("dy", "0.3em")
    .style("paint-order", "stroke")
    .style("stroke", "oklch(var(--b1))")
    .style("stroke-width", "3px")
    .style("stroke-linecap", "round")
    .style("stroke-linejoin", "round");

  const linkLabelMerge = linkLabelEnter.merge(linkLabel)
    .text(d => formatAddress(d.remote_addr));

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

  // Only restart simulation if nodes have changed to avoid jitter
  // If only data properties changed (bandwidth, latency), we don't need to restart physics
  if (nodesChanged) {
    simulation.alpha(1).restart();
  } else {
    // Keep it running gently or just tick once
    // simulation.alpha(0.1).restart(); 
    // Actually, if we don't restart, the new data properties (like stroke width) will update in the DOM 
    // because we called .merge() selection logic below, but positions won't change drastically.
    // However, we need to ensure the tick function runs if we want continuous updates?
    // D3 force simulation stops when alpha reaches alphaMin.
    // If we want to keep it "alive" but stable, we can set a low target alpha.
    // But better: just don't restart aggressively.
    simulation.alpha(0.1).restart();
  }

  simulation.on("tick", () => {
    // Clamp nodes to canvas bounds with padding
    newNodes.forEach((d) => {
      const r = d.type === "self" ? 25 : 18;
      const padding = 20;

      if (d.x !== undefined) {
        d.x = Math.max(r + padding, Math.min(width - r - padding, d.x));
      }
      if (d.y !== undefined) {
        d.y = Math.max(r + padding, Math.min(height - r - padding, d.y));
      }
    });

    // Update curved paths
    linkMerge.attr("d", (d) => {
      const source = d.source as GraphNode;
      const target = d.target as GraphNode;

      if (!source.x || !source.y || !target.x || !target.y) return "";

      const dx = target.x - source.x;
      const dy = target.y - source.y;

      const mx = (source.x + target.x) / 2;
      const my = (source.y + target.y) / 2;

      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) return "";

      // Normal vector
      const nx = -dy / len;
      const ny = dx / len;

      // Use pre-calculated offset
      const offset = d.curvatureOffset;

      const cx = mx + nx * offset;
      const cy = my + ny * offset;

      return `M${source.x},${source.y} Q${cx},${cy} ${target.x},${target.y}`;
    });

    // Update link labels position and rotation
    linkLabelMerge.attr("transform", (d) => {
      const source = d.source as GraphNode;
      const target = d.target as GraphNode;
      if (!source.x || !source.y || !target.x || !target.y) return "";

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const mx = (source.x + target.x) / 2;
      const my = (source.y + target.y) / 2;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) return "";

      const nx = -dy / len;
      const ny = dx / len;

      // Use pre-calculated offset
      const offset = d.curvatureOffset;

      const cx = mx + nx * offset;
      const cy = my + ny * offset;

      const curveX = (mx + cx) / 2;
      const curveY = (my + cy) / 2;

      // Calculate angle
      let angle = Math.atan2(dy, dx) * 180 / Math.PI;
      // Flip if reading backwards
      if (angle > 90 || angle < -90) {
        angle += 180;
      }

      return `translate(${curveX}, ${curveY}) rotate(${angle})`;
    });

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
