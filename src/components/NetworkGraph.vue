<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import * as d3 from "d3";
import { apiData } from "../stores/data";
import type { ApiResponse } from "../types/api";
import { parseAddress, simplifyProtocol } from "../utils/address";

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  type: "self" | "peer";
  ips: string[];
}

interface PortInfo {
  protocol: string;
  srcPort: number;
  dstPort: number;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  id: string; // Unique ID for D3 key
  source: string | GraphNode;
  target: string | GraphNode;
  bandwidth: number;
  latency: number;
  protocols: string[]; // List of protocols supported by the target
  ports: PortInfo[]; // Detailed port info
  curvatureOffset: number;
  isBidirectional?: boolean;
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
      "card shadow-sm rounded-box h-full",
    )
    .style("background-color", "var(--color-base-100)")
    .style("border", "1px solid var(--color-base-300)")
    .append("div")
    .attr("class", "card-body p-4");

  wrapper
    .append("h3")
    .attr("class", "card-title mb-4 text-sm")
    .style("color", "var(--color-base-content)")
    .style("opacity", "0.8")
    .text("Network Topology");

  const svgContainer = wrapper
    .append("div")
    .attr(
      "class",
      "w-full h-[600px] flex justify-center items-center rounded-lg overflow-hidden relative",
    )
    .style("background-color", "var(--color-base-200)");

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
    .attr("stroke", "var(--color-base-content)")
    .attr("stroke-opacity", 0.05)
    .attr("stroke-width", 0.5);

  // Glow filter for active nodes/links
  const filter = defs
    .append("filter")
    .attr("id", "glow")
    .attr("x", "-500%")
    .attr("y", "-500%")
    .attr("width", "1000%")
    .attr("height", "1000%");
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
    .attr("stop-color", "var(--color-primary)");
  selfGradient
    .append("stop")
    .attr("offset", "100%")
    .attr("stop-color", "var(--color-primary)");

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
    .attr("stop-color", "var(--color-success)");
  activeGradient
    .append("stop")
    .attr("offset", "100%")
    .attr("stop-color", "var(--color-success)");

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
      // Update grid pattern transform to create infinite canvas effect
      if (svg) {
        svg.select("#grid").attr("patternTransform", event.transform);
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
        .distance(300) // Increased distance
    )
    .force("charge", d3.forceManyBody().strength(-800)) // Stronger repulsion
    // .force("center", d3.forceCenter(width / 2, height / 2)) // Removed center force as Self node is fixed
    .force(
      "collide",
      d3
        .forceCollide<GraphNode>()
        .radius((d) => (d.type === "self" ? 40 : 30) + 10)
        .strength(0.7)
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
        // simulation.force("center", d3.forceCenter(width / 2, height / 2)); // Removed center update
        simulation.alpha(0.3).restart();
      }
    }
  });

  if (svgContainerElement) {
    resizeObserver.observe(svgContainerElement);
  }
}

function getGraphColor(protocol: string): string {
  const p = simplifyProtocol(protocol).toLowerCase();
  switch (p) {
    case 'tcp': return 'var(--color-info)'; // blue
    case 'udp': return 'var(--color-warning)'; // amber/orange
    case 'quic': return 'var(--color-error)'; // red/pink
    case 'ws': return 'var(--color-success)'; // green
    case 'wss': return 'var(--color-success)'; // green
    case 'http': return 'var(--color-accent)'; // teal/cyan
    case 'p2p': return 'var(--color-secondary)'; // pink
    default: return 'var(--color-neutral)';
  }
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

function drag(simulation: d3.Simulation<GraphNode, GraphLink>) {
  function dragstarted(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) {
    if (d.type === "self") return; // Prevent dragging self node
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) {
    if (d.type === "self") return;
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) {
    if (d.type === "self") return;
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  return d3.drag<SVGGElement, GraphNode>()
    .filter((event, d) => d.type !== "self") // Disable drag initiation for self node
    .on("start", dragstarted)
    .on("drag", dragged)
    .on("end", dragended);
}

function updateGraph(data: ApiResponse) {
  if (!svg || !simulation || !graphGroup) return;

  // Map existing nodes for reuse
  const currentNodesMap = new Map(simulation.nodes().map(n => [n.id, n]));

  // Check if topology has changed
  const currentNodeIds = new Set(simulation.nodes().map(n => n.id));
  const newNodeIds = new Set(data.peers.map(p => p.id));
  const nodesChanged = currentNodeIds.size !== newNodeIds.size || [...currentNodeIds].some(id => !newNodeIds.has(id));

  // Create nodes, reusing existing objects to preserve D3 state
  const newNodes: GraphNode[] = data.peers.map((peer) => {
    const existing = currentNodesMap.get(peer.id);
    const isSelf = peer.id === data.peer_id;
    const ips = peer.addresses ? peer.addresses.map(addr => parseAddress(addr).ip).filter((ip, i, arr) => arr.indexOf(ip) === i && ip !== "Unknown") : [];

    if (existing) {
      existing.name = peer.id;
      existing.type = isSelf ? "self" : "peer";
      existing.ips = ips;
      if (isSelf) {
        existing.fx = width / 2;
        existing.fy = height / 2;
      }
      return existing;
    }

    return {
      id: peer.id,
      name: peer.id,
      type: isSelf ? "self" : "peer",
      ips: ips,
      x: width / 2 + (Math.random() - 0.5) * 50,
      y: height / 2 + (Math.random() - 0.5) * 50,
      fx: isSelf ? width / 2 : undefined,
      fy: isSelf ? height / 2 : undefined,
    };
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

      const bandwidth = conn.bandwidth_mbps || 0;
      const latency = conn.latency_ms || (conn.latency_history?.length ? conn.latency_history[conn.latency_history.length - 1] : 0);

      // Handle multiple ports if present
      if (conn.ports && conn.ports.length > 0) {
        const ports: PortInfo[] = conn.ports.map(p => ({
          protocol: p.protocol,
          srcPort: p.src,
          dstPort: p.dst
        }));

        const protocols = ports.map(p => p.protocol).filter((p, i, arr) => arr.indexOf(p) === i);

        const linkData = {
          source: sourceId,
          target: targetId,
          bandwidth: bandwidth,
          latency: latency,
          protocols: protocols,
          ports: ports,
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
        return;
      }

      // Find target peer to get supported protocols
      const targetPeer = data.peers.find(p => p.id === targetId);
      const targetAddrs = targetPeer ? targetPeer.addresses : [];
      const protocols = targetAddrs.map(a => parseAddress(a).protocol).filter((p, i, arr) => arr.indexOf(p) === i);

      const linkData = {
        source: sourceId,
        target: targetId,
        bandwidth: bandwidth,
        latency: latency,
        protocols: protocols,
        ports: [],
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
        protocols: baseLink.protocols, // Use protocols from one side (should be same/similar set of capabilities)
        ports: baseLink.ports || [],
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

  // Update links (GROUPS instead of PATHS)
  const link = linkGroup
    .selectAll<SVGGElement, GraphLink>("g")
    .data(newLinks, (d) => d.id);

  link.exit().remove();

  const linkEnter = link.enter().append("g").attr("class", "link-group");

  // Append background connection line
  linkEnter.append("path")
    .attr("class", "connection-bg")
    .attr("fill", "none")
    .attr("stroke-opacity", 0.1)
    .attr("stroke", "var(--color-base-content)");

  const linkMerge = linkEnter.merge(link);

  // Update background line
  linkMerge.select(".connection-bg")
    .attr("stroke-width", (d) => {
      const ports = d.ports.length > 0 ? d.ports : d.protocols.map(p => ({ protocol: p, srcPort: 0, dstPort: 0 }));
      return Math.max(16, ports.length * 12 + 8);
    });

  // Manage internal port lines and labels
  linkMerge.each(function (d) {
    const group = d3.select(this);

    // Bind port data to internal paths
    const ports = d.ports.length > 0 ? d.ports : d.protocols.map(p => ({ protocol: p, srcPort: 0, dstPort: 0 }));

    // 1. Port Lines
    const portLines = group.selectAll<SVGPathElement, PortInfo>(".port-line")
      .data(ports);

    portLines.exit().remove();

    portLines.enter()
      .append("path")
      .attr("class", "port-line")
      .attr("fill", "none")
      .attr("stroke-opacity", 0.8)
      .merge(portLines)
      .attr("stroke", (p) => getGraphColor(p.protocol))
      .attr("stroke-width", 2)
      .attr("filter", "url(#glow)");

    // 2. Port Labels
    const portLabels = group.selectAll<SVGGElement, PortInfo>(".port-label")
      .data(ports);

    portLabels.exit().remove();

    const labelEnter = portLabels.enter()
      .append("g")
      .attr("class", "port-label")
      .attr("opacity", 0.9);

    // Background Rect
    labelEnter.append("rect")
      .attr("class", "port-label-bg")
      .attr("rx", 4)
      .attr("ry", 4)
      .attr("fill", "var(--color-base-100)")
      .attr("stroke-width", 1)
      .attr("opacity", 0.9);

    // Protocol Text
    labelEnter.append("text")
      .attr("class", "port-proto")
      .attr("font-family", "monospace")
      .attr("font-size", "8px")
      .attr("text-anchor", "middle")
      .attr("dy", "0.3em")
      .attr("font-weight", "bold");

    // Src Port
    labelEnter.append("text")
      .attr("class", "port-src")
      .attr("font-family", "monospace")
      .attr("font-size", "7px")
      .attr("text-anchor", "end")
      .attr("dx", "-16")
      .attr("dy", "0.3em");

    // Dst Port
    labelEnter.append("text")
      .attr("class", "port-dst")
      .attr("font-family", "monospace")
      .attr("font-size", "7px")
      .attr("text-anchor", "start")
      .attr("dx", "16")
      .attr("dy", "0.3em");

    const labelMerge = labelEnter.merge(portLabels);

    labelMerge.select(".port-proto")
      .text(p => simplifyProtocol(p.protocol))
      .attr("fill", p => getGraphColor(p.protocol));

    labelMerge.select(".port-src")
      .text(p => p.srcPort > 0 ? p.srcPort.toString() : '')
      .attr("fill", "currentColor")
      .attr("opacity", 0.7);

    labelMerge.select(".port-dst")
      .text(p => p.dstPort > 0 ? p.dstPort.toString() : '')
      .attr("fill", "currentColor")
      .attr("opacity", 0.7);

    labelMerge.each(function (p) {
      const group = d3.select(this);
      
      const protoEl = group.select<SVGTextElement>(".port-proto").node();
      const srcEl = group.select<SVGTextElement>(".port-src").node();
      const dstEl = group.select<SVGTextElement>(".port-dst").node();
      
      if (!protoEl || !srcEl || !dstEl) return;
      
      const b1 = protoEl.getBBox();
      const b2 = srcEl.getBBox();
      const b3 = dstEl.getBBox();
      
      let minX = b1.x;
      let minY = b1.y;
      let maxX = b1.x + b1.width;
      let maxY = b1.y + b1.height;
      
      if (p.srcPort > 0 && b2.width > 0) {
        minX = Math.min(minX, b2.x);
        minY = Math.min(minY, b2.y);
        maxX = Math.max(maxX, b2.x + b2.width);
        maxY = Math.max(maxY, b2.y + b2.height);
      }
      
      if (p.dstPort > 0 && b3.width > 0) {
        minX = Math.min(minX, b3.x);
        minY = Math.min(minY, b3.y);
        maxX = Math.max(maxX, b3.x + b3.width);
        maxY = Math.max(maxY, b3.y + b3.height);
      }
      
      const paddingX = 6;
      const paddingY = 4;
      
      group.select(".port-label-bg")
        .attr("x", minX - paddingX)
        .attr("y", minY - paddingY/2)
        .attr("width", maxX - minX + paddingX * 2)
        .attr("height", maxY - minY + paddingY)
        .attr("stroke", getGraphColor(p.protocol))
        .attr("filter", "url(#glow)");
    });
  });

  linkMerge.select("title").remove();
  linkMerge
    .append("title")
    .text(
      (d) =>
        `Protocols: ${d.protocols.join(', ')}\nPorts: ${d.ports.map(p => `${p.srcPort}->${p.dstPort}`).join(', ')}\nBandwidth: ${d.bandwidth.toFixed(3)} Mbps\nLatency: ${d.latency}ms`,
    );

  // Update link labels
  // Removed old label logic as we now have port labels inside the link group
  linkLabelGroup.selectAll("*").remove();


  // Update nodes
  const node = nodeGroup
    .selectAll<SVGGElement, GraphNode>("g")
    .data(newNodes, (d) => d.id);

  node.exit().remove();

  const nodeEnter = node
    .enter()
    .append("g")
    .attr("class", "node-group")
    .call(drag(simulation));

  nodeEnter.append("circle")
    .attr("stroke", "var(--color-base-100)")
    .attr("stroke-width", 2);

  nodeEnter.append("path")
    .attr("fill", "var(--color-base-100)")
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
    .attr("fill", "var(--color-base-100)")
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
      const paddingX = 6;
      const paddingY = 3;

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
  if (nodesChanged) {
    simulation.alpha(1).restart();
  } else {
    // If only data updated, just heat up slightly to settle link lengths, but don't full restart
    // simulation.alpha(0.1).restart();
    // Actually, if we don't restart, the graph stays stable.
    // If the user drags nodes, they stay where they are.
    // If we receive new bandwidth data, we just want to update the DOM (which we did above).
    // So we don't need to restart simulation at all unless we want to react to forces changes?
    // But force parameters are constant.
    // So: do NOTHING if only data changed.
    simulation.restart(); // Just restart with current alpha (which is likely 0) to apply DOM updates? No, DOM updates are applied by D3 selection.
    // We only need simulation.tick() to run if positions need to change.
    // If we want to ensure any drifted nodes come back, we can do alpha(0.01).
    // But user specifically asked to NOT reset layout.
    // So let's skip restart.
  }

  simulation.on("tick", () => {
    // Update curved paths
    linkMerge.each(function (d) {
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

      const offset = d.curvatureOffset;
      const cx = mx + nx * offset;
      const cy = my + ny * offset;

      // Calculate intersection points with node boundaries
      const sourceR = (source.type === "self" ? 25 : 18) + 8;
      const targetR = (target.type === "self" ? 25 : 18) + 8;

      // Vector from Source to Control Point
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

      const mainPath = `M${sx},${sy} Q${cx},${cy} ${tx},${ty}`;

      // Update background path
      group.select(".connection-bg").attr("d", mainPath);

      // Update internal port lines
      const portLines = group.selectAll(".port-line");
      const numPorts = portLines.size();

      if (numPorts > 0) {
        portLines.attr("d", (p, i) => {
          // Calculate offset for this specific port line
          // Spacing: 24px
          const spacing = 24;
          // Center the group of lines
          const totalWidth = (numPorts - 1) * spacing;
          const localOffset = (i * spacing) - (totalWidth / 2);

          // Apply local offset to curvatureOffset
          const totalOffset = d.curvatureOffset + localOffset;

          const pcx = mx + nx * totalOffset;
          const pcy = my + ny * totalOffset;

          // Calculate intersection points with node boundaries for this specific curve
          // Vector from Source to Control Point
          const dxSC = pcx - source.x!;
          const dySC = pcy - source.y!;
          const lenSC = Math.sqrt(dxSC * dxSC + dySC * dySC);

          let psx = source.x!;
          let psy = source.y!;

          if (lenSC > 0) {
            psx += (dxSC / lenSC) * sourceR;
            psy += (dySC / lenSC) * sourceR;
          }

          // Vector from Target to Control Point
          const dxTC = pcx - target.x!;
          const dyTC = pcy - target.y!;
          const lenTC = Math.sqrt(dxTC * dxTC + dyTC * dyTC);

          let ptx = target.x!;
          let pty = target.y!;

          if (lenTC > 0) {
            ptx += (dxTC / lenTC) * targetR;
            pty += (dyTC / lenTC) * targetR;
          }

          return `M${psx},${psy} Q${pcx},${pcy} ${ptx},${pty}`;
        });
      }

      // Update internal port labels
      const portLabels = group.selectAll(".port-label");
      if (portLabels.size() > 0) {
        portLabels.attr("transform", (p: any, i) => {
          // Same spacing logic
          const spacing = 24;
          const totalWidth = (numPorts - 1) * spacing;
          const localOffset = (i * spacing) - (totalWidth / 2);
          const totalOffset = d.curvatureOffset + localOffset;

          const pcx = mx + nx * totalOffset;
          const pcy = my + ny * totalOffset;

          // Re-calculate endpoints
          const dxSC = pcx - source.x!;
          const dySC = pcy - source.y!;
          const lenSC = Math.sqrt(dxSC * dxSC + dySC * dySC);
          let psx = source.x! + (lenSC > 0 ? (dxSC / lenSC) * sourceR : 0);
          let psy = source.y! + (lenSC > 0 ? (dySC / lenSC) * sourceR : 0);

          const dxTC = pcx - target.x!;
          const dyTC = pcy - target.y!;
          const lenTC = Math.sqrt(dxTC * dxTC + dyTC * dyTC);
          let ptx = target.x! + (lenTC > 0 ? (dxTC / lenTC) * targetR : 0);
          let pty = target.y! + (lenTC > 0 ? (dyTC / lenTC) * targetR : 0);

          // Midpoint
          const midX = 0.25 * psx + 0.5 * pcx + 0.25 * ptx;
          const midY = 0.25 * psy + 0.5 * pcy + 0.25 * pty;

          // Angle
          const dxT = ptx - psx;
          const dyT = pty - psy;
          let angle = Math.atan2(dyT, dxT) * (180 / Math.PI);

          // Adjust angle to keep text upright
          if (angle > 90 || angle < -90) {
            angle += 180;
          }

          return `translate(${midX}, ${midY}) rotate(${angle})`;
        });
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
