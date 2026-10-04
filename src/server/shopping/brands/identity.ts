// Deliberately small alias table, not a retailer catalogue. Domains are confidence
// anchors only: the provider must still confirm the brand and supply its logo.
const retailers = [
  { name: 'Walmart', domain: 'walmart.com', aliases: ['walmart', 'walmart supercenter', 'walmart neighborhood market'] },
  { name: 'Walgreens', domain: 'walgreens.com', aliases: ['walgreens'] },
  { name: 'CVS', domain: 'cvs.com', aliases: ['cvs', 'cvs pharmacy', 'cvs health'] },
  { name: 'Kroger', domain: 'kroger.com', aliases: ['kroger'] },
  { name: 'Sprouts', domain: 'sprouts.com', aliases: ['sprouts', 'sprouts farmers market'] },
  { name: 'H Mart', domain: 'hmart.com', aliases: ['h mart', 'hmart'] },
  { name: 'Costco', domain: 'costco.com', aliases: ['costco', 'costco wholesale', 'costco wholesale corporation'] },
  { name: 'Target', domain: 'target.com', aliases: ['target', 'target corporation'] },
  { name: 'Whole Foods Market', domain: 'wholefoodsmarket.com', aliases: ['whole foods', 'whole foods market'] },
  { name: "Trader Joe's", domain: 'traderjoes.com', aliases: ['trader joes'] },
  { name: '99 Ranch Market', domain: '99ranch.com', aliases: ['99 ranch', '99 ranch market'] },
  { name: 'Safeway', domain: 'safeway.com', aliases: ['safeway'] },
];
export function nameKey(value: string) { return value.normalize('NFKC').toLowerCase().replace(/[’']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
export function retailerIdentity(value: string) {
  const key = nameKey(value);
  const known = retailers.find(r => r.aliases.includes(key));
  return { displayName: known?.name ?? value.trim(), normalizedName: nameKey(known?.name ?? value), expectedDomain: known?.domain };
}
export function normalizeDomain(value?: string | null): string | null {
  if (!value || value.length > 2048) return null;
  try {
    const u = new URL(value.includes('://') ? value.trim() : `https://${value.trim()}`);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.port) return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
    if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) return null;
    if (host.endsWith('.localhost') || host.endsWith('.local')) return null;
    return host;
  } catch { return null; }
}
export function safeLogo(value: string): string | null {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname === 'cdn.brandfetch.io' && !u.username && !u.password && !u.port && [...u.searchParams.keys()].every(k => k === 'c') && u.search.length <= 512 && !u.hash ? u.href : null;
  } catch { return null; }
}

/** A website alone may be a social/marketplace page. Require brand/name agreement
 * as well, allowing location suffixes only for explicitly known retailer domains. */
export function brandAgreesWithStore(storeName: string, brandName: string, domain: string): boolean {
  const store = retailerIdentity(storeName), brand = retailerIdentity(brandName);
  if (store.expectedDomain) return store.expectedDomain === domain;
  const known = retailers.find(r => r.domain === domain);
  if (known && known.aliases.some(alias => nameKey(storeName).startsWith(`${alias} `))) return true;
  return store.normalizedName === brand.normalizedName;
}
