export interface Peer {
  id: string;
  version: string;
  metadata: any | null;
  public_key: string;
  addresses: string[];
  connections: Connection[];
}

export interface Connection {
  peer_id: string;
  version?: string;
  // active and state are removed in new structure
  relay: number;
  // local_addr and remote_addr are removed in new structure
  // latency_ms?: number; // kept as optional just in case
  latency_ms?: number; // Example JSON shows latency_ms: 0 or 1000
  latency_display?: string; // Not in JSON, maybe computed?
  bandwidth_mbps: number;
  bandwidth_display?: string; // Not in JSON
  packet_loss_rate: number;
  packet_loss_display?: string; // Not in JSON
  // New fields from JSON
  id?: string;
  last_seen?: string;
  quality?: number;
  packets_sent?: number;
  packets_lost?: number;
  bytes_sent?: string;
  bytes_received?: string;
  latency_history?: number[];
  last_ping_time?: string;
  nat_type?: string;
  ports?: PortMapping[];
}

export interface PortMapping {
  src: number;
  protocol: string;
  dst: number;
}

export interface Route {
  target_peer_id: string;
  next_hop: string;
  hops: number;
  timestamp: string;
}

export interface ApiResponse {
  status: string;
  peers: Peer[];
  // connections?: Connection[]; // This field seems to be gone from root in example.json, but was present in old structure.
  // In example.json, root has `peers`, and `peers` have `connections`.
  // However, the old code might rely on root.connections.
  // The old `ConnectionsTable` checked `d?.connections || (d?.peers?.find((p) => p.id === d?.peer_id)?.connections)`.
  // So if `connections` is missing from root, it falls back to finding the peer.
  // But let's keep it optional for now or remove it if confirmed gone.
  // Based on example.json, it's not at the root level anymore.
  peers_count: number;
  peer_id: string;
  listeners: string[];
  known_peers: string[];
  routes: Route[];
}
