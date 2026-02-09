<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import * as d3 from "d3";
import { apiData } from "../stores/data";
import type { ApiResponse } from "../types/api";

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  type: "self" | "peer";
  ips: string[];
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  id: string; // Unique ID for D3 key
  source: string | GraphNode;
  target: string | GraphNode;
  bandwidth: number;
  latency: number;
  remote_addr: string;
  local_addr?: string;
  curvatureOffset: number;
  isBidirectional?: boolean;
  protocol?: string;
  port?: string;
  local_port?: string;
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
    // .force("charge", d3.forceManyBody().strength(-4000)) // Stronger repulsion
    .force("center", d3.forceCenter(width / 2, height / 2))
    // .force(
    //   "radial",
    //   d3
    //     .forceRadial(100, width / 2, height / 2) // Increased radius to avoid clumping
    //     .strength(0.05) // Reduced strength
    // ) // Gentle gravity towards center
    .force(
      "collide",
      d3
        .forceCollide<GraphNode>()
        .radius((d) => (d.type === "self" ? 35 : 25) + 100) // Increased collision radius for labels
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

function simplifyProtocol(p: string): string {
  if (!p) return "";
  const upper = p.toUpperCase();
  if (upper.includes("WSS")) return "WSS";
  if (upper.includes("WS")) return "WS";
  if (upper.includes("QUIC")) return "QUIC";
  if (upper.includes("P2P")) return "P2P";
  if (upper.includes("TCP")) return "TCP";
  if (upper.includes("UDP")) return "UDP";
  return upper.split('/')[0];
}

function getProtocolColor(protocol: string): string {
  const p = simplifyProtocol(protocol).toLowerCase();
  switch (p) {
    case 'tcp': return '#3B82F6'; // blue-500
    case 'udp': return '#F59E0B'; // amber-500
    case 'quic': return '#8B5CF6'; // violet-500
    case 'ws': return '#10B981'; // emerald-500
    case 'wss': return '#059669'; // emerald-600
    case 'http': return '#14B8A6'; // teal-500
    case 'p2p': return '#EC4899'; // pink-500
    default: return '#9CA3AF';
  }
}

function parseAddress(addr: string): { ip: string, port: string, protocol: string } {
  let ip = "";
  let port = "";
  let protocol = "";

  if (!addr) return { ip: "Unknown", port: "", protocol: "" };

  // Try to parse multiaddr
  if (addr.startsWith("/")) {
    const parts = addr.split("/").filter((p) => p);
    // Common parts: ['ip4', '1.2.3.4', 'tcp', '8080']

    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === "ip4" || parts[i] === "ip6") {
        ip = parts[i + 1];
        i++;
      } else if (["tcp", "udp", "quic", "ws", "wss", "p2p-circuit"].includes(parts[i])) {
        protocol = protocol ? `${protocol}/${parts[i]}` : parts[i];
        if (parts[i + 1] && /^\d+$/.test(parts[i + 1])) {
          port = parts[i + 1];
          i++;
        }
      }
    }

    // Fallback if IP not found but other parts exist (e.g. dns)
    if (!ip && parts.length > 0) {
      // Just take the value after the first key if it looks like an address/domain
      if (!['tcp', 'udp', 'quic', 'ws', 'wss', 'p2p-circuit'].includes(parts[0])) {
        ip = parts[1] || parts[0];
      }
    }
  } else if (addr.includes("://")) {
    const parts = addr.split("://");
    protocol = parts[0];
    const remainder = parts[1];

    // Handle IPv6 brackets if present
    const lastColonIndex = remainder.lastIndexOf(":");
    // Simple check: if last colon is after the last bracket (if any)
    const lastBracketIndex = remainder.lastIndexOf("]");

    if (lastColonIndex !== -1 && lastColonIndex > lastBracketIndex) {
      port = remainder.substring(lastColonIndex + 1);
      ip = remainder.substring(0, lastColonIndex);
      // remove brackets if ipv6
      if (ip.startsWith("[") && ip.endsWith("]")) {
        ip = ip.slice(1, -1);
      }
    } else {
      ip = remainder;
    }
  } else {
    ip = addr;
  }

  return { ip, port, protocol: protocol.toUpperCase() };
}

function formatAddress(addr: string): string {
  const { ip, port, protocol } = parseAddress(addr);
  if (ip) {
    return `${ip}${port ? `:${port}` : ""} ${protocol ? `(${protocol})` : ""}`;
  }
  return addr;
}

function truncateId(id: string): string {
  if (id.length <= 12) return id;
  return id.substring(0, 6) + "..." + id.substring(id.length - 4);
}

function getIconPath(type: "self" | "peer"): string {
  if (type === "self") {
    // Home icon
    return "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z";
  }
  // Server/Desktop icon
  return "M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z";
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
      ips: peer.addresses ? peer.addresses.map(addr => parseAddress(addr).ip).filter((ip, i, arr) => arr.indexOf(ip) === i && ip !== "Unknown") : [],
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

  // 1. Collect all raw link data by connection ID to identify bidirectional pairs
  const connectionMap = new Map<string, any[]>();
  const standaloneLinks: any[] = [];

  data.peers.forEach((peer) => {
    if (!peer.connections) return;

    peer.connections.forEach((conn, index) => {
      const sourceId = peer.id;
      const targetId = conn.peer_id;

      // Skip self-loops
      if (sourceId === targetId) return;

      const parsed = parseAddress(conn.remote_addr);
      const parsedLocal = parseAddress(conn.local_addr || "");
      const linkData = {
        source: sourceId,
        target: targetId,
        bandwidth: conn.bandwidth_mbps || 0,
        latency: conn.latency_ms || (conn.latency_history?.length ? conn.latency_history[conn.latency_history.length - 1] : 0),
        remote_addr: conn.remote_addr,
        local_addr: conn.local_addr,
        protocol: parsed.protocol,
        port: parsed.port,
        local_port: parsedLocal.port,
        id: conn.id,
        originalIndex: index
      };

      if (conn.id) {
        if (!connectionMap.has(conn.id)) {
          connectionMap.set(conn.id, []);
        }
        connectionMap.get(conn.id)!.push(linkData);
      } else {
        standaloneLinks.push(linkData);
      }
    });
  });

  const logicalLinks: GraphLink[] = [];

  // 2. Process connection pairs (Bidirectional merging based on same ID)
  connectionMap.forEach((links, connId) => {
    // If multiple links share the same ID, they are part of the same bidirectional connection
    if (links.length > 1) {
      // Merge them into a single logical link
      // We use the first link as the base for source/target direction (it doesn't strictly matter for undirected graph visual, 
      // but we need consistent direction for curvature calculation later)
      const baseLink = links[0];

      // Calculate aggregate stats
      const totalBandwidth = links.reduce((sum, l) => sum + l.bandwidth, 0);
      const avgLatency = links.reduce((sum, l) => sum + l.latency, 0) / links.length;

      logicalLinks.push({
        ...baseLink,
        id: `merged-${connId}`, // Unique ID for D3
        isBidirectional: true,
        bandwidth: totalBandwidth,
        latency: avgLatency,
        remote_addr: links.map(l => l.remote_addr).join(" ↔ "),
        // Keep protocol/port from base link or maybe show mixed?
        // Let's keep it simple for now
        protocol: baseLink.protocol,
        port: baseLink.port,
        local_port: baseLink.local_port,
        curvatureOffset: 0
      });
    } else {
      // Single link found for this ID (unidirectional or data incomplete)
      logicalLinks.push({
        ...links[0],
        id: `conn-${connId}`,
        curvatureOffset: 0
      });
    }
  });

  // Add standalone links (those without IDs)
  standaloneLinks.forEach(l => {
    logicalLinks.push({
      ...l,
      id: `${l.source}-${l.target}-${l.originalIndex}`,
      curvatureOffset: 0
    });
  });

  // 3. Group by node pair to assign curvature
  const pairGroups = new Map<string, GraphLink[]>();

  logicalLinks.forEach(link => {
    // Create a canonical key for the pair
    const s = typeof link.source === 'object' ? (link.source as GraphNode).id : link.source as string;
    const t = typeof link.target === 'object' ? (link.target as GraphNode).id : link.target as string;
    const key = [s, t].sort().join("|||");

    if (!pairGroups.has(key)) {
      pairGroups.set(key, []);
    }
    pairGroups.get(key)!.push(link);
  });

  // 4. Assign offsets
  pairGroups.forEach((links, key) => {
    const [id1, id2] = key.split("|||");
    const n = links.length;
    links.forEach((link, i) => {
      const spacing = 50;
      const offset = (i - (n - 1) / 2) * spacing;

      // Check direction relative to canonical key
      // link.source might be string ID or Node object depending on D3 state, but here we construct newLinks so it's string ID from logicalLinks
      const sId = typeof link.source === 'object' ? (link.source as GraphNode).id : link.source as string;

      if (sId === id1) {
        link.curvatureOffset = offset;
      } else {
        link.curvatureOffset = -offset;
      }

      newLinks.push(link);
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
    .attr("stroke", (d) => getProtocolColor(d.protocol || 'TCP')) // Color by protocol
    .attr("stroke-width", (d) => Math.max(1.5, d.bandwidth * 2))
    .attr("filter", "url(#glow)"); // Always glow

  linkMerge.select("title").remove();
  linkMerge
    .append("title")
    .text(
      (d) =>
        `Remote: ${d.remote_addr}\nBandwidth: ${d.bandwidth.toFixed(3)} Mbps\nLatency: ${d.latency}ms`,
    );

  // Update link labels
  const linkLabel = linkLabelGroup
    .selectAll<SVGGElement, GraphLink>("g")
    .data(newLinks, (d) => d.id);

  linkLabel.exit().remove();

  const linkLabelEnter = linkLabel.enter().append("g")
    .attr("class", "link-label-group");

  // Protocol Label Background (Rect)
  linkLabelEnter.append("rect")
    .attr("class", "proto-bg")
    .attr("rx", 4)
    .attr("ry", 4)
    .attr("fill", "oklch(var(--b1))")
    .attr("stroke", "currentColor")
    .attr("stroke-width", 1)
    .attr("opacity", 0.9);

  // Protocol Text
  linkLabelEnter.append("text")
    .attr("class", "proto-text")
    .attr("font-family", "monospace")
    .attr("font-size", "10px")
    .attr("fill", "currentColor")
    .attr("text-anchor", "middle")
    .attr("dy", "0.3em")
    .attr("font-weight", "bold");

  // Source Port Text
  linkLabelEnter.append("text")
    .attr("class", "port-src")
    .attr("font-family", "monospace")
    .attr("font-size", "9px")
    .attr("fill", "currentColor")
    .attr("opacity", 0.8)
    .attr("text-anchor", "middle")
    .attr("dy", "0.3em");

  // Target Port Text
  linkLabelEnter.append("text")
    .attr("class", "port-dst")
    .attr("font-family", "monospace")
    .attr("font-size", "9px")
    .attr("fill", "currentColor")
    .attr("opacity", 0.8)
    .attr("text-anchor", "middle")
    .attr("dy", "0.3em");

  const linkLabelMerge = linkLabelEnter.merge(linkLabel);

  linkLabelMerge.select(".proto-text")
    .text(d => simplifyProtocol(d.protocol || ''))
    .style("fill", d => getProtocolColor(d.protocol || ''));

  linkLabelMerge.select(".proto-bg")
    .style("stroke", d => getProtocolColor(d.protocol || ''));

  linkLabelMerge.select(".port-src")
    .text(d => d.local_port || '');

  linkLabelMerge.select(".port-dst")
    .text(d => d.port || '');

  // Calculate rect size based on text length (approximate)
  linkLabelMerge.each(function (d) {
    const group = d3.select(this);
    const text = simplifyProtocol(d.protocol || '');
    const width = text.length * 7 + 10; // Approx width
    group.select(".proto-bg")
      .attr("width", width)
      .attr("height", 16)
      .attr("x", -width / 2)
      .attr("y", -8);
  });


  // Update nodes
  const node = nodeGroup
    .selectAll<SVGGElement, GraphNode>("g")
    .data(newNodes, (d) => d.id);

  node.exit().remove();

  const nodeEnter = node
    .enter()
    .append("g")
    .attr("class", "node-group");

  nodeEnter.append("circle")
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 2);

  nodeEnter.append("path")
    .attr("fill", "white")
    .attr("d", d => getIconPath(d.type))
    .attr("transform", "translate(-12, -12) scale(1)"); // Center the 24x24 icon

  const nodeMerge = nodeEnter.merge(node);

  nodeMerge.select("circle")
    .attr("r", (d) => (d.type === "self" ? 25 : 18)) // Increased size
    .attr("fill", (d) => {
      if (d.type === "self") return "url(#grad-self)";
      return "url(#grad-active)";
    })
    .attr("filter", "url(#glow)"); // Always glow

  nodeMerge.select("path")
    .attr("transform", d => {
      const scale = d.type === "self" ? 1.2 : 0.8;
      const offset = d.type === "self" ? -14 : -10;
      return `translate(${offset}, ${offset}) scale(${scale})`;
    });

  nodeMerge.select("title").remove();
  nodeMerge
    .append("title")
    .text(
      (d) => `${d.name} (${d.type})`,
    );

  // Update labels
  const label = labelGroup
    .selectAll<SVGGElement, GraphNode>("g")
    .data(newNodes, (d) => d.id);

  label.exit().remove();

  const labelEnter = label
    .enter()
    .append("g")
    .attr("class", "label-group");

  // Label Background (Rect)
  labelEnter.append("rect")
    .attr("class", "label-bg")
    .attr("rx", 6)
    .attr("ry", 6)
    .attr("fill", "oklch(var(--b1))")
    .attr("stroke", "currentColor")
    .attr("stroke-width", 1)
    .attr("opacity", 0.9);

  labelEnter.append("text")
    .attr("font-size", "12px")
    .attr("fill", "currentColor")
    .attr("class", "text-base-content fill-current")
    .attr("text-anchor", "middle")
    .attr("dy", "0em");

  const labelMerge = labelEnter.merge(label);

  // Update text content
  const textSel = labelMerge.select("text");
  textSel.text(null);

  textSel.each(function (d) {
    const el = d3.select(this);
    // Peer ID
    el.append("tspan")
      .attr("x", 0)
      .attr("dy", "1.2em")
      .attr("font-weight", "bold")
      .text(truncateId(d.name));

    // IPs
    d.ips.forEach((ip) => {
      el.append("tspan")
        .attr("x", 0)
        .attr("dy", "1.2em")
        .attr("font-size", "10px")
        .attr("class", "opacity-70")
        .text(ip);
    });
  });

  // Resize rect based on text
  labelMerge.each(function (d) {
    const group = d3.select(this);
    const textEl = group.select("text").node() as SVGTextElement;
    if (textEl) {
      const bbox = textEl.getBBox();
      const paddingX = 10;
      const paddingY = 6;

      group.select("rect")
        .attr("x", bbox.x - paddingX)
        .attr("y", bbox.y - paddingY)
        .attr("width", bbox.width + paddingX * 2)
        .attr("height", bbox.height + paddingY * 2);
    }
  });

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

      // Calculate intersection points with node boundaries
      const sourceR = (source.type === "self" ? 25 : 18) + 8; // Radius + padding
      const targetR = (target.type === "self" ? 25 : 18) + 8;

      // Vector from Source to Control Point (tangent approximation)
      const dxSC = cx - source.x;
      const dySC = cy - source.y;
      const lenSC = Math.sqrt(dxSC * dxSC + dySC * dySC);

      let sx = source.x;
      let sy = source.y;

      if (lenSC > 0) {
        sx += (dxSC / lenSC) * sourceR;
        sy += (dySC / lenSC) * sourceR;
      }

      // Vector from Target to Control Point
      const dxTC = cx - target.x;
      const dyTC = cy - target.y;
      const lenTC = Math.sqrt(dxTC * dxTC + dyTC * dyTC);

      let tx = target.x;
      let ty = target.y;

      if (lenTC > 0) {
        tx += (dxTC / lenTC) * targetR;
        ty += (dyTC / lenTC) * targetR;
      }

      return `M${sx},${sy} Q${cx},${cy} ${tx},${ty}`;
    });

    // Update link labels position and rotation
    linkLabelMerge.each(function (d) {
      const group = d3.select(this);
      const source = d.source as GraphNode;
      const target = d.target as GraphNode;
      if (!source.x || !source.y || !target.x || !target.y) return;

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) return;

      const mx = (source.x + target.x) / 2;
      const my = (source.y + target.y) / 2;

      const nx = -dy / len;
      const ny = dx / len;

      // Use pre-calculated offset
      const offset = d.curvatureOffset;

      const cx = mx + nx * offset;
      const cy = my + ny * offset;

      // Calculate intersection points with node boundaries
      const sourceR = (source.type === "self" ? 25 : 18) + 8; // Radius + padding
      const targetR = (target.type === "self" ? 25 : 18) + 8;

      // Vector from Source to Control Point (tangent approximation)
      const dxSC = cx - source.x;
      const dySC = cy - source.y;
      const lenSC = Math.sqrt(dxSC * dxSC + dySC * dySC);

      let sx = source.x;
      let sy = source.y;

      if (lenSC > 0) {
        sx += (dxSC / lenSC) * sourceR;
        sy += (dySC / lenSC) * sourceR;
      }

      // Vector from Target to Control Point
      const dxTC = cx - target.x;
      const dyTC = cy - target.y;
      const lenTC = Math.sqrt(dxTC * dxTC + dyTC * dyTC);

      let tx = target.x;
      let ty = target.y;

      if (lenTC > 0) {
        tx += (dxTC / lenTC) * targetR;
        ty += (dyTC / lenTC) * targetR;
      }

      // Curve midpoint at t=0.5 (Quadratic Bezier)
      // B(t) = (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2
      // t = 0.5
      // B(0.5) = 0.25 P0 + 0.5 P1 + 0.25 P2
      const curveX = 0.25 * sx + 0.5 * cx + 0.25 * tx;
      const curveY = 0.25 * sy + 0.5 * cy + 0.25 * ty;

      // Calculate angle
      let angle = Math.atan2(dy, dx) * 180 / Math.PI;
      // Flip if reading backwards
      if (angle > 90 || angle < -90) {
        angle += 180;
      }

      // Update group transform for the central part
      // We'll apply the rotation to the whole group, but we need to position the ports relative to this rotated frame
      // Actually, it's easier to position everything absolutely if we don't rotate the whole group?
      // But rotation matches the line direction.
      // Let's rotate the whole group around the midpoint.

      group.attr("transform", `translate(${curveX}, ${curveY}) rotate(${angle})`);

      // Now calculate positions for ports relative to the midpoint (0,0) in the rotated frame.
      // The distance from midpoint to start/end is roughly half the path length.
      // But since it's a curve, it's not exactly linear distance.
      // However, for visualization, placing them at fixed offsets from center might be enough?
      // No, connection lengths vary wildy.

      // Calculate distance from curve midpoint to start/end in the unrotated frame
      const distStart = Math.sqrt(Math.pow(sx - curveX, 2) + Math.pow(sy - curveY, 2));
      const distEnd = Math.sqrt(Math.pow(tx - curveX, 2) + Math.pow(ty - curveY, 2));

      // We want ports to be slightly inwards from the ends.
      // In the rotated frame, the line is roughly horizontal along X axis.
      // Source is at negative X, Target is at positive X (or vice versa depending on rotation).
      // Angle logic: atan2(dy, dx) means 0 deg is +X.
      // If we didn't flip angle: Source is left (-X), Target is right (+X).
      // If we flipped angle (added 180): Source is right (+X), Target is left (-X).

      const flipped = (Math.atan2(dy, dx) * 180 / Math.PI) > 90 || (Math.atan2(dy, dx) * 180 / Math.PI) < -90;

      // Adjust offsets
      // We want to place text immediately next to the protocol label (center)
      const text = simplifyProtocol(d.protocol || '');
      const protoWidth = text.length * 7 + 10;
      const halfWidth = protoWidth / 2;
      const gap = 4;

      if (flipped) {
        // Flipped: +X is Source side, -X is Target side
        group.select(".port-src")
          .attr("x", halfWidth + gap)
          .attr("text-anchor", "start");

        group.select(".port-dst")
          .attr("x", -(halfWidth + gap))
          .attr("text-anchor", "end");
      } else {
        // Normal: -X is Source side, +X is Target side
        group.select(".port-src")
          .attr("x", -(halfWidth + gap))
          .attr("text-anchor", "end");

        group.select(".port-dst")
          .attr("x", halfWidth + gap)
          .attr("text-anchor", "start");
      }
    });

    nodeMerge.attr("transform", (d) => `translate(${d.x!}, ${d.y!})`);

    labelMerge.attr("transform", (d) => {
      // Offset the label group downwards to appear below the node
      return `translate(${d.x!}, ${d.y! + 30})`;
    });
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
