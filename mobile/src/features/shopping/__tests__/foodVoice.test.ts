import { foodVoiceContext, foodVoiceItem, type FoodVoiceContext, type FoodVoiceLookupResponse } from '../foodVoice';

/** Port of ios/Tests/NexdoCoreTests/FoodVoiceTests.swift. */

test('the context holds only the two bounded product queries', () => {
  const context = foodVoiceContext(foodVoiceItem('a'.repeat(250), null, 'not-a-barcode'), foodVoiceItem('Milk', 'Example', '12345678'));
  const object = JSON.parse(JSON.stringify(context)) as FoodVoiceContext;
  expect(Object.keys(object).sort()).toEqual(['alternative', 'original']);
  expect(context.original.name).toHaveLength(200);
  expect(context.original.barcode).toBeUndefined();
  expect(object).toEqual(context);
  expect(context.alternative).toEqual({ name: 'Milk', brand: 'Example', barcode: '12345678' });
});

test('a lookup result keeps its source and leaves unknown allergens unknown', () => {
  const result = JSON.parse(
    '{"success":true,"facts":{"source":"USDA","matchQuality":"representative_generic","nutrition":{"servingSize":"100 g","servingAmount":100,"servingUnit":"g","calories":60}},"error":null}',
  ) as FoodVoiceLookupResponse;
  const roundTrip = JSON.parse(JSON.stringify(result)) as FoodVoiceLookupResponse;
  expect(roundTrip.facts?.source).toBe('USDA');
  expect(roundTrip.facts?.nutrition?.calories).toBe(60);
  expect(roundTrip.facts?.contains).toBeUndefined();
});
