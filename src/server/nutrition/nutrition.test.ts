import { describe, expect, it } from 'vitest';
import { calculateCalories, portionGrams } from './calories';
import { keyWords } from './text';
import { nutritionCallSession, nutritionCallTools } from './session';
import { dateRange, dueCall, effectiveCallTime, withinCallWindow } from './time';
import { callToken, codeTwiml, streamTwiml, twilioSignature, validTwilioRequest, verifyCallToken } from './twilio';
import type { FoodFacts } from '@/server/shopping/food/model';

const facts = (kcalPer100: number, unit: 'g' | 'ml' = 'g'): FoodFacts => ({
  schemaVersion: 1, id: 'USDA:1', name: 'Bananas, raw', source: 'USDA', sourceProductId: '1', sourceURL: '', matchQuality: 'representative_generic',
  retrievedAt: '', expiresAt: '', dataCompleteness: 'partial', nutritionUnavailable: false,
  nutrition: { servingSize: `100 ${unit}`, servingAmount: 100, servingUnit: unit, calories: kcalPer100, protein: 1.1, carbohydrates: 22.8, totalFat: 0.3 },
  contains: [], mayContain: [], allergenStatus: 'unknown', dietary: [], freeFrom: [], bestFor: [],
});

describe('call scheduling', () => {
  it('is due from the saved time for one hour, in the user time zone', () => {
    const at = (iso: string) => dueCall('20:00', 'America/Los_Angeles', new Date(iso));
    expect(at('2026-09-28T02:59:00Z')).toBeNull();                       // 19:59 PDT
    expect(at('2026-09-28T03:00:00Z')).toMatchObject({ localDate: '2026-09-27' });
    expect(at('2026-09-28T03:00:00Z')?.scheduledFor.toISOString()).toBe('2026-09-28T03:00:00.000Z');
    expect(at('2026-09-28T04:00:00Z')).not.toBeNull();                   // 21:00, 60 min late
    expect(at('2026-09-28T04:01:00Z')).toBeNull();                       // past the grace window
  });
  it('clamps saved times into 08:00–21:30 and never dials after 21:30', () => {
    expect(effectiveCallTime('06:15')).toBe('08:00');
    expect(effectiveCallTime('23:00')).toBe('21:30');
    expect(effectiveCallTime('20:00')).toBe('20:00');
    expect(dueCall('21:30', 'Asia/Kolkata', new Date('2026-09-27T16:00:00Z'))).not.toBeNull(); // 21:30 IST exactly
    expect(dueCall('21:30', 'Asia/Kolkata', new Date('2026-09-27T16:10:00Z'))).toBeNull();     // 21:40 IST: too late tonight
    expect(withinCallWindow('Asia/Kolkata', new Date('2026-09-27T16:10:00Z'))).toBe(false);
    expect(withinCallWindow('Asia/Kolkata', new Date('2026-09-27T14:30:00Z'))).toBe(true);     // 20:00 IST
  });
  it('handles a daylight-saving change day', () => {
    // US clocks go back on 2026-11-01; 20:00 PST that day is 04:00Z on Nov 2.
    expect(dueCall('20:00', 'America/New_York', new Date('2026-11-02T01:00:00Z'))?.scheduledFor.toISOString()).toBe('2026-11-02T01:00:00.000Z');
  });
  it('builds inclusive date ranges', () => {
    expect(dateRange('2026-03-02', 3)).toEqual(['2026-02-28', '2026-03-01', '2026-03-02']);
  });
});

describe('calories', () => {
  it('prefers explicit weight units over the model estimate', () => {
    expect(portionGrams({ quantity: 2, unit: 'oz', estimatedGrams: 999 })).toEqual({ grams: 56.7, fromVolume: false });
    expect(portionGrams({ quantity: 1, unit: 'piece', estimatedGrams: 118 })).toEqual({ grams: 118, fromVolume: false });
    expect(portionGrams({ quantity: 250, unit: 'ml' })).toEqual({ grams: 250, fromVolume: true });
    expect(portionGrams({ unit: 'bowl' })).toEqual({ grams: null, fromVolume: false });
    expect(portionGrams({ quantity: 10, unit: 'kg' })).toEqual({ grams: null, fromVolume: false }); // implausible portion
  });
  it('computes calories in code from database values per 100 g', async () => {
    const r = await calculateCalories({ meal: 'BREAKFAST', description: 'a banana', foodName: 'banana', estimatedGrams: 118, estimatedKcal: 500 }, async () => facts(89));
    expect(r).toMatchObject({ foodName: 'banana', matchedName: 'Bananas, raw', kcal: 105, grams: 118, source: 'USDA', needsReview: false, proteinG: 1.3, carbsG: 26.9, fatG: 0.4 });
  });
  it('falls back to the flagged model estimate when there is no match or no portion', async () => {
    const none = await calculateCalories({ meal: 'LUNCH', description: 'chicken biryani', foodName: 'chicken biryani', estimatedGrams: 350, estimatedKcal: 650 }, async () => null);
    expect(none).toMatchObject({ kcal: 650, source: 'ESTIMATE', needsReview: true, reviewReason: 'no_database_match' });
    const failing = await calculateCalories({ meal: 'LUNCH', description: 'x', foodName: 'x', estimatedKcal: 10 }, async () => { throw new Error('down'); });
    expect(failing).toMatchObject({ source: 'ESTIMATE', kcal: 10 });
    const noPortion = await calculateCalories({ meal: 'LUNCH', description: 'rice', foodName: 'rice', unit: 'bowl', estimatedKcal: 200 }, async () => facts(130));
    expect(noPortion).toMatchObject({ source: 'ESTIMATE', reviewReason: 'portion_unknown' });
  });
  it('flags volume converted at water density for foods measured per gram', async () => {
    const r = await calculateCalories({ meal: 'SNACKS', description: '200 ml milk', foodName: 'milk', quantity: 200, unit: 'ml', estimatedKcal: 1 }, async () => facts(61));
    expect(r).toMatchObject({ kcal: 122, needsReview: true, reviewReason: 'volume_converted_at_water_density' });
  });
});

describe('twilio and worker tokens', () => {
  it('matches an independently computed Twilio signature', () => {
    const url = 'https://app.example.com/api/nutrition-calls/twiml?callId=abc';
    const params = { CallSid: 'CA123', AccountSid: 'AC9', AnsweredBy: 'human', From: '+14155550100' };
    expect(twilioSignature('secret-token', url, params)).toBe('HeR5RgiByIkiTKN0ICEi2y/GFW4=');
    expect(validTwilioRequest('secret-token', url, params, 'HeR5RgiByIkiTKN0ICEi2y/GFW4=')).toBe(true);
    expect(validTwilioRequest('secret-token', url, { ...params, AnsweredBy: 'machine_start' }, 'HeR5RgiByIkiTKN0ICEi2y/GFW4=')).toBe(false);
    expect(validTwilioRequest('', url, params, 'HeR5RgiByIkiTKN0ICEi2y/GFW4=')).toBe(false);
  });
  it('signs call tokens so a stream can only claim its own call', () => {
    const token = callToken('s3cret', 'call_1');
    expect(verifyCallToken('s3cret', token)).toBe('call_1');
    expect(verifyCallToken('other', token)).toBeNull();
    expect(verifyCallToken('s3cret', token.replace('call_1', 'call_2'))).toBeNull();
    expect(verifyCallToken('', token)).toBeNull();
  });
  it('reads the verification code aloud digit by digit, three times', () => {
    const twiml = codeTwiml('042917');
    expect(twiml.match(/0, 4, 2, 9, 1, 7/g)).toHaveLength(3);
    expect(twiml).toContain('<Say voice="Polly.Joanna">');
  });
  it('escapes TwiML attributes', () => {
    expect(streamTwiml('wss://w.example.com/twilio-media', 'a"b<c')).toContain('value="a&quot;b&lt;c"');
  });
  it('extracts content words for the backup-transcript check', () => {
    expect(keyWords('Two rotis with a bowl of dal')).toEqual(['two', 'rotis', 'dal']);
  });
});

describe('realtime session', () => {
  const session = nutritionCallSession({ firstName: 'Asha', timeZone: 'America/Los_Angeles', localDate: '2026-09-27', calorieGoal: 1800, voice: 'cedar', maxSeconds: 300, alreadyLogged: [] });
  it('uses phone audio both ways, the chosen voice and near-field noise reduction', () => {
    expect(session.audio.input.format).toEqual({ type: 'audio/pcmu' });
    expect(session.audio.output).toEqual({ format: { type: 'audio/pcmu' }, voice: 'cedar' });
    expect(session.audio.input.noise_reduction).toEqual({ type: 'near_field' });
    expect(session.model).toBe('gpt-realtime-2.1');
  });
  it('discloses the AI and transcription, caps at 5 minutes and forbids model-stated calories', () => {
    expect(session.instructions).toContain("it's NexDo's AI assistant");
    expect(session.instructions).toContain('transcribed');
    expect(session.instructions).toContain('within 5 minutes');
    expect(session.instructions).toContain('Never state a calorie number yourself');
    expect(nutritionCallTools.map(t => t.name)).toEqual(['log_food_items', 'update_food_item', 'remove_food_item', 'get_day_summary', 'finish_call', 'call_back_later', 'skip_today']);
  });
});
