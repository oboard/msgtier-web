export interface ParsedAddress {
  protocol: string;
  ip: string;
  port: string;
  isIPv6: boolean;
  raw: string;
}

export function parseAddress(addr: string): ParsedAddress {
  // Format: protocol://ip:port or protocol://[ipv6]:port
  const protocolMatch = addr.match(/^([a-z0-9]+):\/\//);
  const protocol = protocolMatch ? protocolMatch[1] : 'unknown';
  
  let remaining = addr;
  if (protocolMatch) {
    remaining = addr.slice(protocolMatch[0].length);
  }

  // Check for IPv6 (enclosed in brackets)
  const ipv6Match = remaining.match(/^\[([a-fA-F0-9:]+)\]:(\d+)$/);
  if (ipv6Match) {
    return {
      protocol,
      ip: ipv6Match[1],
      port: ipv6Match[2],
      isIPv6: true,
      raw: addr
    };
  }

  // Check for IPv4 or hostname
  const ipv4Match = remaining.match(/^([^:]+):(\d+)$/);
  if (ipv4Match) {
    return {
      protocol,
      ip: ipv4Match[1],
      port: ipv4Match[2],
      isIPv6: false, // Could be hostname too, but treating as non-IPv6 for simplicity
      raw: addr
    };
  }

  return {
    protocol,
    ip: remaining,
    port: '',
    isIPv6: false,
    raw: addr
  };
}

export function simplifyProtocol(p: string): string {
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

export function getProtocolColor(protocol: string): string {
  const p = simplifyProtocol(protocol).toLowerCase();
  switch (p) {
    case 'tcp': return 'badge-info'; // blue/cyan
    case 'udp': return 'badge-warning'; // orange/yellow
    case 'quic': return 'badge-error'; // red/pink (or purple)
    case 'ws': return 'badge-success'; // green
    case 'wss': return 'badge-success';
    default: return 'badge-ghost';
  }
}
