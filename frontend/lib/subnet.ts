// Dynamic /24 subnet grouping for the bulk-scan server picker.
// Segments are derived from whatever IPs exist — nothing is hardcoded.

const OTHER_BUCKET = "Lainnya / Hostname";

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function parseIpv4(addr: string): number[] | null {
  const m = IPV4_RE.exec((addr || "").trim());
  if (!m) return null;
  const octets = m.slice(1, 5).map((o) => parseInt(o, 10));
  if (octets.some((o) => o < 0 || o > 255)) return null;
  return octets;
}

/**
 * Return the /24 label for an address, e.g. "10.20.70.x".
 * Non-IPv4 values (hostnames) fall into a shared "Lainnya / Hostname" bucket.
 */
export function subnetOf(addr: string): string {
  const octets = parseIpv4(addr);
  if (!octets) return OTHER_BUCKET;
  return `${octets[0]}.${octets[1]}.${octets[2]}.x`;
}

export interface SubnetGroup<T = any> {
  subnet: string;
  servers: T[];
}

/**
 * Group servers by their /24 subnet (using ip_address, falling back to hostname).
 * Groups are ordered numerically by octet; the non-IP bucket is placed last.
 * Servers within a group are ordered by their last octet (IPs) or name.
 */
export function groupServersBySubnet<T extends Record<string, any>>(
  servers: T[]
): SubnetGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const s of servers) {
    const addr = s.ip_address || s.hostname || "";
    const key = subnetOf(addr);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(s);
  }

  const octetsOf = (subnet: string): number[] => {
    const m = /^(\d+)\.(\d+)\.(\d+)\.x$/.exec(subnet);
    return m ? [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)] : [];
  };

  const groups: SubnetGroup<T>[] = Array.from(buckets.entries()).map(
    ([subnet, list]) => {
      list.sort((a, b) => {
        const ia = parseIpv4(a.ip_address || a.hostname || "");
        const ib = parseIpv4(b.ip_address || b.hostname || "");
        if (ia && ib) return ia[3] - ib[3];
        const la = (a.hostname || a.ip_address || "").toString();
        const lb = (b.hostname || b.ip_address || "").toString();
        return la.localeCompare(lb);
      });
      return { subnet, servers: list };
    }
  );

  groups.sort((a, b) => {
    const isOtherA = a.subnet === OTHER_BUCKET;
    const isOtherB = b.subnet === OTHER_BUCKET;
    if (isOtherA !== isOtherB) return isOtherA ? 1 : -1; // non-IP bucket last
    const oa = octetsOf(a.subnet);
    const ob = octetsOf(b.subnet);
    for (let i = 0; i < 3; i++) {
      if ((oa[i] ?? 0) !== (ob[i] ?? 0)) return (oa[i] ?? 0) - (ob[i] ?? 0);
    }
    return a.subnet.localeCompare(b.subnet);
  });

  return groups;
}
