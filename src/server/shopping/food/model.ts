export type Nutrient = 'calories' | 'protein' | 'totalFat' | 'saturatedFat' | 'carbohydrates' | 'sugar' | 'sodium' | 'calcium' | 'fiber';
export const nutrients: Nutrient[] = ['calories','protein','totalFat','saturatedFat','carbohydrates','sugar','sodium','calcium','fiber'];
export type Nutrition = Partial<Record<Nutrient, number>> & { servingSize: string; servingAmount: number; servingUnit: 'g' | 'ml' };
export type MatchQuality = 'exact_barcode' | 'branded_match' | 'representative_generic';
/** The iOS facts contract, extended rather than a second shopping domain object. */
export type FoodFacts = {
  schemaVersion: 1; id: string; name: string; barcode?: string; brand?: string; size?: string; imageURL?: string;
  source: 'USDA' | 'OPEN_FOOD_FACTS'; sourceProductId: string; sourceURL: string; matchQuality: MatchQuality;
  retrievedAt: string; expiresAt: string; lastUpdated?: string; freshness?: 'fresh' | 'stale';
  dataCompleteness: 'partial' | 'complete'; nutritionUnavailable: boolean; nutrition?: Nutrition;
  ingredientText?: string; contains: string[]; mayContain: string[]; allergenStatus: 'declared' | 'unknown';
  dietary: string[]; freeFrom: string[]; bestFor: string[];
};
export type FoodQuery = { name: string; brand?: string; barcode?: string; size?: string };
export const normalizeQuery = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, ' ').trim().replace(/\s+/g,' ');
export const canonicalBarcode = (value: string) => /^\d{8,14}$/.test(value) ? value.padStart(14, '0') : '';
export function finite(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined; }
export type Difference = { state: 'lower' | 'same' | 'higher' | 'unknown'; amount?: number };
export function compare(original?: FoodFacts | null, alternative?: FoodFacts | null): Record<Nutrient, Difference> {
  const a = original?.nutrition, b = alternative?.nutrition;
  return Object.fromEntries(nutrients.map(key => {
    if (!a || !b || a.servingUnit !== b.servingUnit || !(a.servingAmount > 0) || !(b.servingAmount > 0) || finite(a[key]) === undefined || finite(b[key]) === undefined) return [key,{state:'unknown'}];
    const delta = b[key]! * a.servingAmount / b.servingAmount - a[key]!;
    if (!Number.isFinite(delta)) return [key,{state:'unknown'}];
    return [key, Math.abs(delta) < 0.0001 ? {state:'same',amount:0} : {state:delta<0?'lower':'higher',amount:Math.abs(delta)}];
  })) as Record<Nutrient,Difference>;
}
export function usages(name: string): string[] { return /milk/i.test(name) ? ['Cereal','Coffee','Cooking','Smoothies'] : []; }
export function baseFacts(source: FoodFacts['source'], id: string, name: string, matchQuality: MatchQuality): FoodFacts {
  return {schemaVersion:1,id:`${source}:${id}`,source,sourceProductId:id,name,matchQuality,
    sourceURL:source==='USDA'?`https://fdc.nal.usda.gov/food-details/${id}/nutrients`:`https://world.openfoodfacts.org/product/${id}`,
    retrievedAt:new Date().toISOString(),expiresAt:new Date().toISOString(),dataCompleteness:'partial',nutritionUnavailable:true,
    contains:[],mayContain:[],allergenStatus:'unknown',dietary:[],freeFrom:[],bestFor:usages(name)};
}
export function complete(facts: FoodFacts): FoodFacts {
  facts.nutritionUnavailable = !facts.nutrition || !nutrients.some(k=>finite(facts.nutrition?.[k])!==undefined);
  if (facts.nutritionUnavailable) delete facts.nutrition;
  facts.dataCompleteness = nutrients.every(k=>finite(facts.nutrition?.[k])!==undefined) && !!facts.ingredientText && facts.allergenStatus==='declared' ? 'complete':'partial';
  return facts;
}
