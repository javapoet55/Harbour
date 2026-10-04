import { z } from 'zod';
import { createHash } from 'node:crypto';
import { inc } from '@/lib/metrics';
import { databaseStorage, type CacheStorage } from '../food/cache';
import { BrandfetchClient } from './client';
import { normalizeDomain, retailerIdentity, safeLogo, brandAgreesWithStore } from './identity';
export type StoreBrand = { displayName: string; normalizedName: string; domain: string | null; logoUrl: string | null; brandfetchId?: string; source: 'brandfetch' | 'fallback'; fetchedAt?: string; expiresAt?: string };
const DAY = 86400000;
const cachedBrand = z.object({ displayName:z.string(), normalizedName:z.string(), domain:z.string().nullable(), logoUrl:z.string().refine(v=>!!safeLogo(v)).nullable(), brandfetchId:z.string().optional(), source:z.enum(['brandfetch','fallback']), fetchedAt:z.string(), expiresAt:z.string() });
export class StoreBrandService {
  constructor(private client = new BrandfetchClient(), private storage: CacheStorage = databaseStorage, private now = () => Date.now()) {}
  async resolve(name: string, website?: string | null): Promise<StoreBrand> {
    const identity = retailerIdentity(name), domain = normalizeDomain(website);
    const fallback: StoreBrand = { displayName: identity.displayName, normalizedName: identity.normalizedName, domain, logoUrl: null, source: 'fallback' };
    if (!name.trim() || !this.client.enabled) return fallback;
    const key = `store-brand:v1:${createHash('sha256').update(domain ? `domain:${domain}` : `name:${identity.normalizedName}`).digest('hex')}`;
    const read = async () => {
      const row = await this.storage.read(key);
      if (row?.payload && row.schemaVersion === 1 && +row.expiresAt > this.now()) { try { const parsed=cachedBrand.safeParse(JSON.parse(row.payload)); return parsed.success ? parsed.data : null; } catch { return null; } }
      return null;
    };
    try {
      const cached = await read();
      if (cached) { inc('brandfetch.cache_hit'); return cached; }
      inc('brandfetch.cache_miss');
      // Existing cross-replica lease prevents simultaneous paid requests.
      if (!await this.storage.claim(key, new Date(this.now()))) return fallback;
      try {
        const latest = await read(); if (latest) return latest;
        let resolvedDomain = domain;
        if (!resolvedDomain) {
          const candidates = await this.client.searchBrand(identity.displayName);
          // Without a physical store website, unknown/local names are ambiguous even
          // if their spelling matches. Never pick a fuzzy or first-ranked result.
          const accepted = candidates.filter(c => identity.expectedDomain && normalizeDomain(c.domain) === identity.expectedDomain && c.name && retailerIdentity(c.name).normalizedName === identity.normalizedName);
          if (new Set(accepted.map(c => c.domain)).size === 1) resolvedDomain = normalizeDomain(accepted[0].domain);
        }
        let result = fallback;
        if (!domain && resolvedDomain) {
          // Canonical domain cache is shared with future Places-backed lookups.
          result = await this.resolve(name, resolvedDomain);
        }
        if (domain && resolvedDomain) {
          const brand = await this.client.getBrand(resolvedDomain);
          if (brand && brandAgreesWithStore(name, brand.name, resolvedDomain)) {
            const logoUrl = this.client.resolveLogo(brand);
            if (logoUrl) result = { ...fallback, displayName: brand.name, domain: resolvedDomain, logoUrl, brandfetchId: brand.id, source: 'brandfetch' };
          }
        }
        inc(result.logoUrl ? 'brandfetch.match' : 'brandfetch.no_match');
        const expires = new Date(Math.min(result.expiresAt ? Date.parse(result.expiresAt) : Infinity, this.now() + (result.logoUrl ? 29 * DAY : DAY)));
        result = { ...result, fetchedAt: result.fetchedAt ?? new Date(this.now()).toISOString(), expiresAt: expires.toISOString() };
        await this.storage.write(key, JSON.stringify(result), expires, expires);
        return result;
      } finally { await this.storage.release(key); }
    } catch { inc('brandfetch.error'); return fallback; }
  }
}
export const storeBrandService = new StoreBrandService();
