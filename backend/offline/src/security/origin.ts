import { BlockList, isIP } from 'node:net';
import type { RequestHandler } from 'express';
import type { Config } from '../config.js';

export function createIpMatcher(cidrs: string[]) {
  const block = new BlockList();
  for (const cidr of cidrs) {
    const [address, prefix, extra] = cidr.split('/');
    const version = isIP(address);
    const bits = version === 4 ? 32 : 128;
    if (
      !version ||
      extra !== undefined ||
      (prefix !== undefined &&
        (!/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > bits))
    ) {
      throw new Error('Invalid or unrestricted callback IP/CIDR');
    }
    const type = version === 4 ? 'ipv4' : 'ipv6';
    if (prefix === undefined) block.addAddress(address, type);
    else block.addSubnet(address, Number(prefix), type);
  }
  return (address: string | undefined) => {
    const normalized = address?.startsWith('::ffff:') ? address.slice(7) : address;
    if (!normalized) return false;
    const version = isIP(normalized);
    return !!version && block.check(normalized, version === 4 ? 'ipv4' : 'ipv6');
  };
}

export function providerOrigin(
  config: Pick<Config, 'allowedCidrs' | 'callbackAuthMode'>,
): RequestHandler {
  const allowed = createIpMatcher(config.allowedCidrs);
  return (req, res, next) => {
    // Development/test callbacks work through a tunnel. The secret callback path
    // is still required; production additionally enforces provider IP ranges.
    if (config.callbackAuthMode === 'development_open') return next();
    if (!allowed(req.ip)) return res.status(403).type('text').send('Forbidden');
    next();
  };
}
