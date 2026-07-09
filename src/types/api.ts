// Port scanning: what a node broadcasts about its own listening ports.
export interface LocalPortEntry {
  protocol: 'tcp' | 'udp' | string;
  bind_addr: string;
  port: number;
  process_name?: string | null;
}

// A user-created forward: pull peer's remote_host:remote_port to local_host:local_port.
export interface PortMappingRule {
  id: string;
  peer_id: string;
  remote_protocol: string;
  remote_host: string;
  remote_port: number;
  local_host: string;
  local_port: number;
  enabled: boolean;
  created_at: number;
  note?: string | null;
}

export interface PortScanPeersEntry {
  last_updated: string;
  ports: LocalPortEntry[];
}

export interface PortScanPeersResponse {
  peers: Record<string, PortScanPeersEntry>;
}

export interface PortScanLocalResponse {
  ports: LocalPortEntry[];
}

export interface PortMappingsResponse {
  mappings: PortMappingRule[];
}

// Legacy runtime metadata about active mappings (still emitted in /api/status).
export interface PortForwardMeta {
  id: string;
  protocol: string;
  direction: 'forward';
  state: string;
  peer_id?: string;
  listen_host?: string;
  listen_port?: number;
}

export interface Channel {
  id: string;
  type: string;
  label: string;
  state: string;
  peer_id?: string;
  meta?: Record<string, unknown>;
}

export interface PeerMetadata {
  scripts?: string[];
  channels?: Channel[];
  port_forwards?: PortForwardMeta[];
  [key: string]: unknown;
}

export interface Peer {
  id: string;
  version: string;
  metadata: PeerMetadata | null;
  public_key: string;
  addresses: string[];
  connections: Connection[];
}

export interface Connection {
  peer_id: string;
  version?: string;
  relay: number;
  latency_ms?: number;
  latency_display?: string;
  bandwidth_mbps: number;
  bandwidth_display?: string;
  packet_loss_rate: number;
  packet_loss_display?: string;
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

// NAT-related mapping in connection info (unrelated to PortMappingRule above).
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

export interface HotReloadSettings {
  enable?: boolean | null;
  secret?: string | null;
}

export interface StaticConfigLayer {
  id: string;
  secret: string;
  peers: string[];
  listeners: string[];
  web_api?: string | null;
}

export interface HotConfigLayer {
  scripts?: Record<string, string> | null;
  metadata?: Record<string, string> | null;
  log?: string | null;
  relay_network_whitelist?: string[] | null;
  relay_all_peer_rpc?: boolean | null;
  foreign_relay_bps_limit?: number | null;
  upload_dir?: string | null;
  disable_encryption?: boolean | null;
  hot_reload?: HotReloadSettings | null;
}

export interface ConfigResponse extends StaticConfigLayer, HotConfigLayer {
  static_config: StaticConfigLayer;
  hot_config: HotConfigLayer;
}

export interface ApiResponse {
  status: string;
  peers: Peer[];
  peers_count: number;
  peer_id: string;
  listeners: string[];
  known_peers: string[];
  routes: Route[];
}
