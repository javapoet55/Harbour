import { providerPermit, providerBackoff } from '../food/cache';
import { z } from 'zod';
import { inc } from '@/lib/metrics';
import { normalizeDomain, safeLogo } from './identity';
const candidate = z.object({ name: z.string().nullable(), domain: z.string(), brandId: z.string() });
const brand = z.object({ id: z.string(), name: z.string(), domain: z.string(), isNsfw: z.boolean().optional(), logos: z.array(z.object({ type: z.string(), formats: z.array(z.object({ src: z.string(), format: z.string(), width: z.number().nullish(), height: z.number().nullish(), size: z.number().nullish() })) })) });
export type BrandCandidate = z.infer<typeof candidate>;
export type BrandData = z.infer<typeof brand>;
export class BrandfetchClient {
  private blockedUntil = 0;
  constructor(private key = process.env.BRANDFETCH_API_KEY ?? '', private clientId = process.env.BRANDFETCH_CLIENT_ID ?? '', private request: typeof fetch = fetch) {}
  get enabled() { return !!this.key; }
  private async get(path: string, authenticated: boolean): Promise<unknown> {
    if (!this.key || Date.now() < this.blockedUntil || (!authenticated && !this.clientId)) return null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!await providerPermit('brandfetch')) return null;
      inc('brandfetch.lookup');
      try {
        const response = await this.request(`https://api.brandfetch.io/v2/${path}`, {
          headers: authenticated ? { Authorization: `Bearer ${this.key}` } : {},
          signal: AbortSignal.timeout(4000), cache: 'no-store', redirect: 'error',
        });
        if (!response.ok) {
          await response.body?.cancel();
          inc('brandfetch.error');
          if (response.status === 429) {
            inc('brandfetch.rate_limited');
            const retry = response.headers.get('retry-after');
            const seconds = Number(retry) || Math.max(0, (Date.parse(retry ?? '') - Date.now()) / 1000) || 60;
            const backoff = Math.min(3600, Math.max(60, seconds));
            this.blockedUntil = Date.now() + backoff * 1000;
            await providerBackoff('brandfetch', backoff);
          }
          if ([401, 402, 403].includes(response.status)) this.blockedUntil = Date.now() + 300000;
          if (response.status >= 500 && attempt === 0) { await new Promise(r => setTimeout(r, 200)); continue; }
          return null;
        }
        // Bound external JSON; never read or log error bodies, keys, or headers.
        const reader = response.body?.getReader();
        if (!reader) return null;
        const chunks: Uint8Array[] = []; let size = 0;
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > 512000) { await reader.cancel(); return null; }
          chunks.push(value);
        }
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch { inc('brandfetch.error'); return null; }
    }
    return null;
  }
  async searchBrand(query: string): Promise<BrandCandidate[]> {
    const result = z.array(candidate).max(100).safeParse(await this.get(`search/${encodeURIComponent(query)}?c=${encodeURIComponent(this.clientId)}`, false));
    return result.success ? result.data : [];
  }
  async getBrand(domain: string): Promise<BrandData | null> {
    const normalized = normalizeDomain(domain); if (!normalized) return null;
    const result = brand.safeParse(await this.get(`brands/${encodeURIComponent(normalized)}`, true));
    return result.success && !result.data.isNsfw && normalizeDomain(result.data.domain) === normalized ? result.data : null;
  }
  resolveLogo(value: BrandData): string | null {
    const formats = [...value.logos].sort((a,b) => Number(b.type === 'icon') - Number(a.type === 'icon')).flatMap(l => l.formats);
    const chosen = formats.find(f => ['png','webp','jpeg','jpg'].includes(f.format) && !!safeLogo(f.src) && (!this.key || !f.src.includes(this.key)) && (!f.size || f.size <= 1000000) && (!f.width || f.width <= 4096) && (!f.height || f.height <= 4096));
    return chosen ? safeLogo(chosen.src) : null;
  }
}
