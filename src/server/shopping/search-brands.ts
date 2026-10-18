import { storeBrandService } from './brands/service';
import { normalizeDomain, retailerIdentity } from './brands/identity';

/** Reuse retailer matches across branches while preserving Google's result order and addresses. */
export async function addStoreBrands<T extends { name: string; website?: string }>(stores: T[]) {
  const lookups = new Map<string, Promise<{ displayName: string; logoUrl: string | null }>>();
  return Promise.all(stores.map(async store => {
    const key = `${normalizeDomain(store.website) ?? ''}|${retailerIdentity(store.name).normalizedName}`;
    let lookup = lookups.get(key);
    if (!lookup) {
      lookup = storeBrandService.resolve(store.name, store.website)
        .then(brand => ({ displayName: brand.displayName, logoUrl: brand.logoUrl }))
        .catch(() => ({ displayName: store.name, logoUrl: null }));
      lookups.set(key, lookup);
    }
    return { ...store, brand: await lookup };
  }));
}
