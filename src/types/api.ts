export interface Peer {
  id: string;
  version: string;
  metadata: any | null;
  public_key: string;
  adresses: string[];
  connections: Connection[];
}

export interface Connection {
  peer_id: string;
  version?: string;
  active?: boolean;
  state?: string;
  relay: number;
  local_addr: string;
  remote_addr: string;
  latency_ms?: number;
  latency_display?: string;
  bandwidth_mbps: number;
  bandwidth_display?: string;
  packet_loss_rate: number;
  packet_loss_display?: string;
  // New fields from JSON
  id?: string;
  last_seen?: string;
  quality?: number;
  packets_sent?: number;
  packets_lost?: number;
  bytes_sent?: string;
  bytes_received?: string;
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
  connections?: Connection[];
  peers_count: number;
  peer_id: string;
  listeners: string[];
  known_peers: string[];
  routes: Route[];
}
