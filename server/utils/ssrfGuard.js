import dns from 'node:dns/promises'
import net from 'node:net'

// Thrown when a URL targets a blocked address or is otherwise unsafe to fetch.
export class SsrfError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SsrfError'
  }
}

const MAX_URL_LENGTH = 2048

// LOCAL DEVELOPMENT / TESTING ESCAPE HATCH — do NOT enable in production.
// When AUDIT_ALLOW_PRIVATE_HOSTS === 'true', the private/loopback/link-local IP
// checks are skipped so audits can hit local fixtures (e.g. 127.0.0.1). Protocol,
// credential, and format checks are ALWAYS enforced. This flag is intentionally
// absent from render.yaml so production stays fully protected.
function allowPrivateHosts() {
  return process.env.AUDIT_ALLOW_PRIVATE_HOSTS === 'true'
}

// ---- IPv4 range checks ---------------------------------------------------
function ipv4ToInt(ip) {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let out = 0
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const n = Number(p)
    if (n > 255) return null
    out = (out << 8) + n
  }
  return out >>> 0
}

function inRange4(ipInt, baseIp, bits) {
  const baseInt = ipv4ToInt(baseIp)
  if (ipInt === null || baseInt === null) return false
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return (ipInt & mask) === (baseInt & mask)
}

// Non-public IPv4 ranges we must never fetch from a server.
const BLOCKED_V4 = [
  ['0.0.0.0', 8],       // "this" network / unspecified
  ['10.0.0.0', 8],      // private
  ['100.64.0.0', 10],   // carrier-grade NAT
  ['127.0.0.0', 8],     // loopback
  ['169.254.0.0', 16],  // link-local (incl. 169.254.169.254 cloud metadata)
  ['172.16.0.0', 12],   // private
  ['192.0.0.0', 24],    // IETF protocol assignments
  ['192.168.0.0', 16],  // private
  ['198.18.0.0', 15],   // benchmarking
  ['224.0.0.0', 4],     // multicast
  ['240.0.0.0', 4],     // reserved
]

function isBlockedV4(ip) {
  const ipInt = ipv4ToInt(ip)
  if (ipInt === null) return true
  return BLOCKED_V4.some(([base, bits]) => inRange4(ipInt, base, bits))
}

// ---- IPv6 range checks ---------------------------------------------------
// Parse an IPv6 string (incl. :: compression and embedded dotted IPv4) into its
// 16 bytes, or null if malformed.
function ipv6ToBytes(input) {
  let s = input
  const dotted = s.match(/:(\d+\.\d+\.\d+\.\d+)$/)
  if (dotted) {
    const v4 = ipv4ToInt(dotted[1])
    if (v4 === null) return null
    const hi = ((v4 >>> 16) & 0xffff).toString(16)
    const lo = (v4 & 0xffff).toString(16)
    s = s.slice(0, s.length - dotted[1].length) + hi + ':' + lo
  }

  const halves = s.split('::')
  if (halves.length > 2) return null
  const toGroups = str => (str === '' ? [] : str.split(':'))
  const head = toGroups(halves[0])
  const tail = halves.length === 2 ? toGroups(halves[1]) : null

  let groups
  if (tail === null) {
    groups = head
  } else {
    const missing = 8 - (head.length + tail.length)
    if (missing < 1) return null
    groups = [...head, ...Array(missing).fill('0'), ...tail]
  }
  if (groups.length !== 8) return null

  const bytes = new Uint8Array(16)
  for (let i = 0; i < 8; i++) {
    if (!/^[0-9a-f]{1,4}$/.test(groups[i])) return null
    const v = parseInt(groups[i], 16)
    bytes[i * 2] = (v >> 8) & 0xff
    bytes[i * 2 + 1] = v & 0xff
  }
  return bytes
}

function isBlockedV6(ip) {
  let addr = ip.toLowerCase()
  const zone = addr.indexOf('%')
  if (zone >= 0) addr = addr.slice(0, zone) // strip scope id

  const b = ipv6ToBytes(addr)
  if (!b) return true // fail closed on unparseable input

  // IPv4-mapped ::ffff:0:0/96 — evaluate the embedded IPv4 address
  const isMapped = b.slice(0, 10).every(x => x === 0) && b[10] === 0xff && b[11] === 0xff
  if (isMapped) return isBlockedV4(`${b[12]}.${b[13]}.${b[14]}.${b[15]}`)

  if (b.slice(0, 15).every(x => x === 0) && b[15] === 1) return true // ::1 loopback
  if (b.every(x => x === 0)) return true                             // :: unspecified
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true           // fe80::/10 link-local
  if ((b[0] & 0xfe) === 0xfc) return true                            // fc00::/7 unique-local
  if (b[0] === 0xff) return true                                     // ff00::/8 multicast
  return false
}

// True if an IP literal is in a blocked (non-public) range. Unknown/invalid
// inputs are treated as blocked (fail closed).
export function isBlockedIp(ip) {
  const kind = net.isIP(ip)
  if (kind === 4) return isBlockedV4(ip)
  if (kind === 6) return isBlockedV6(ip)
  return true
}

/**
 * Validate that a URL is safe for the server to fetch, guarding against SSRF.
 * Rejects: malformed URLs, non-http(s) schemes, embedded credentials, and any
 * host that is (or resolves to) a loopback/private/link-local/metadata address.
 *
 * Resolves DNS where the host is not already an IP literal, so a hostname that
 * resolves to a blocked address is rejected. (Residual DNS-rebinding risk is
 * noted in the README — a full mitigation would pin the resolved IP.)
 *
 * @param {string} rawUrl
 * @returns {Promise<string>} the validated href
 * @throws {SsrfError}
 */
export async function assertUrlSafe(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > MAX_URL_LENGTH) {
    throw new SsrfError('Invalid URL.')
  }

  let u
  try {
    u = new URL(rawUrl)
  } catch {
    throw new SsrfError('Invalid URL.')
  }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new SsrfError('Only http and https URLs are allowed.')
  }
  if (u.username || u.password) {
    throw new SsrfError('URLs with embedded credentials are not allowed.')
  }

  let host = u.hostname
  if (!host) throw new SsrfError('Invalid URL.')
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1) // IPv6 literal

  const skipIpChecks = allowPrivateHosts()

  // Host is already an IP literal — check it directly.
  if (net.isIP(host)) {
    if (!skipIpChecks && isBlockedIp(host)) throw new SsrfError('This address is not allowed.')
    return u.href
  }

  // Otherwise resolve and check every returned address.
  let addresses
  try {
    addresses = await dns.lookup(host, { all: true })
  } catch {
    throw new SsrfError('Could not resolve host.')
  }
  if (!addresses || addresses.length === 0) {
    throw new SsrfError('Could not resolve host.')
  }
  if (!skipIpChecks) {
    for (const { address } of addresses) {
      if (isBlockedIp(address)) throw new SsrfError('This address is not allowed.')
    }
  }
  return u.href
}
