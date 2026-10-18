import { afterEach, expect, it, vi } from 'vitest';
vi.mock('./brands/service', () => ({ storeBrandService: { resolve: vi.fn() } }));
import { storeBrandService } from './brands/service';
import { addStoreBrands } from './search-brands';
afterEach(() => vi.resetAllMocks());
it('shares matching retailer lookups but keeps each branch address and order', async () => {
  vi.mocked(storeBrandService.resolve).mockResolvedValue({ displayName: 'Whole Foods', normalizedName: 'whole foods', domain: 'wholefoodsmarket.com', logoUrl: 'https://cdn.brandfetch.io/test/logo.png', source: 'brandfetch' });
  const stores = [
    { name: 'Whole Foods Market', website: 'https://wholefoodsmarket.com/stores/one', address: 'First street' },
    { name: 'Whole Foods Market', website: 'https://wholefoodsmarket.com/stores/two', address: 'Second street' },
  ];
  const result = await addStoreBrands(stores);
  expect(storeBrandService.resolve).toHaveBeenCalledTimes(1);
  expect(result.map(s => s.address)).toEqual(['First street', 'Second street']);
  expect(result.every(s => s.brand.logoUrl?.startsWith('https://cdn.brandfetch.io/'))).toBe(true);
});
it('keeps search results usable when the logo provider fails', async () => {
  vi.mocked(storeBrandService.resolve).mockRejectedValue(new Error('unavailable'));
  expect(await addStoreBrands([{ name: 'Local shop', address: 'Main street' }])).toEqual([
    { name: 'Local shop', address: 'Main street', brand: { displayName: 'Local shop', logoUrl: null } },
  ]);
});
