import { createHash } from 'node:crypto';
import { z } from 'zod';
import { categories, categoryFor } from './domain';

export type ShoppingAlternative = { name: string; category: typeof categories[number]; quantity: string; size: string; reason: string; detail: string };
export type ShoppingAlternatives = { alternatives: ShoppingAlternative[]; tip: string; usedAI: boolean };

const resultSchema = z.object({
  alternatives: z.array(z.object({
    name: z.string().trim().min(1).max(120), category: z.enum(categories), quantity: z.string().trim().min(1).max(40),
    size: z.string().trim().max(80), reason: z.string().trim().min(1).max(80), detail: z.string().trim().min(1).max(140),
  })).min(3).max(5),
  tip: z.string().trim().min(1).max(220),
});

const curated: Array<[RegExp, Omit<ShoppingAlternatives, 'usedAI'>]> = [
  [/chicken(?: breast)?/i, { alternatives: [
    { name: 'Chicken breast (skinless)', category: 'Meat & Seafood', quantity: '1', size: 'lb', reason: 'Lower in calories', detail: 'Lean cut with less saturated fat' },
    { name: 'Turkey breast', category: 'Meat & Seafood', quantity: '1', size: 'lb', reason: 'Lean protein', detail: 'Mild flavor and lower in fat' },
    { name: 'Salmon', category: 'Meat & Seafood', quantity: '1', size: 'lb', reason: 'Heart healthy', detail: 'Rich in omega-3 fatty acids' },
    { name: 'Firm tofu', category: 'Produce', quantity: '1', size: 'package', reason: 'Plant-based alternative', detail: 'Versatile source of protein' },
    { name: 'Chickpeas', category: 'Pantry', quantity: '2', size: 'cans', reason: 'High fiber option', detail: 'Plant-based protein with fiber' },
  ], tip: 'Try turkey breast for a lean swap with a similar mild flavor.' }],
  [/whole milk|milk 2%|milk/i, { alternatives: [
    { name: 'Low-fat milk', category: 'Dairy & Eggs', quantity: '1', size: 'gallon', reason: 'Lower fat option', detail: 'Similar dairy taste with less fat' },
    { name: 'Lactose-free milk', category: 'Dairy & Eggs', quantity: '1', size: 'gallon', reason: 'Lactose-free', detail: 'Dairy milk without lactose' },
    { name: 'Unsweetened oat milk', category: 'Dairy & Eggs', quantity: '1', size: 'carton', reason: 'Plant-based option', detail: 'Creamy texture without dairy' },
    { name: 'Unsweetened soy milk', category: 'Dairy & Eggs', quantity: '1', size: 'carton', reason: 'More plant protein', detail: 'Neutral flavor with protein' },
  ], tip: 'Choose an unsweetened alternative to avoid added sugar.' }],
  [/white rice|rice/i, { alternatives: [
    { name: 'Brown rice', category: 'Pantry', quantity: '1', size: 'bag', reason: 'More whole grains', detail: 'Nutty flavor and more fiber' },
    { name: 'Quinoa', category: 'Pantry', quantity: '1', size: 'bag', reason: 'Protein-rich grain', detail: 'Quick-cooking complete protein' },
    { name: 'Cauliflower rice', category: 'Frozen', quantity: '1', size: 'bag', reason: 'Vegetable option', detail: 'Light substitute for rice dishes' },
  ], tip: 'Brown rice is the closest whole-grain swap for everyday meals.' }],
];

function fallback(name: string, category: typeof categories[number], quantity: string, size: string): ShoppingAlternatives {
  const match = curated.find(([pattern]) => pattern.test(name));
  if (match) return { ...match[1], usedAI: false };
  const base = name.replace(/^organic\s+/i, '').trim();
  const alternatives: ShoppingAlternative[] = [
    { name: `Organic ${base}`, category, quantity, size, reason: 'Organic option', detail: 'A comparable certified-organic choice' },
    { name: `Store-brand ${base}`, category, quantity, size, reason: 'Budget-friendly', detail: 'A similar option that may cost less' },
    { name: `Family-size ${base}`, category, quantity, size: size || 'large pack', reason: 'Larger package', detail: 'Useful when you need more servings' },
  ];
  return { alternatives, tip: `Compare unit prices and package sizes before replacing ${base}.`, usedAI: false };
}

function outputText(payload: { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> }) {
  return payload.output_text || payload.output?.flatMap(item => item.content ?? []).map(item => item.text ?? '').join('') || '';
}

export async function recommendShoppingAlternatives(userId: string, input: { name: string; category?: string; quantity?: string; size?: string }): Promise<ShoppingAlternatives> {
  const category = categories.includes(input.category as typeof categories[number]) ? input.category as typeof categories[number] : categoryFor(input.name);
  const quantity = input.quantity?.trim() || '1';
  const size = input.size?.trim() || '';
  const local = fallback(input.name, category, quantity, size);
  if (!process.env.OPENAI_API_KEY) return local;
  try {
    const schema = { type: 'object', additionalProperties: false, required: ['alternatives', 'tip'], properties: {
      alternatives: { type: 'array', minItems: 3, maxItems: 5, items: { type: 'object', additionalProperties: false, required: ['name', 'category', 'quantity', 'size', 'reason', 'detail'], properties: {
        name: { type: 'string' }, category: { type: 'string', enum: categories }, quantity: { type: 'string' }, size: { type: 'string' }, reason: { type: 'string' }, detail: { type: 'string' },
      } } }, tip: { type: 'string' },
    } };
    const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', signal: AbortSignal.timeout(12000), headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-5.4-mini', store: false, max_output_tokens: 900,
      instructions: 'Suggest 3 to 5 practical grocery alternatives. Keep claims general and avoid medical advice. Preserve useful quantity or package context. Return only the requested JSON.',
      input: JSON.stringify({ item: { name: input.name, category, quantity, size } }),
      text: { format: { type: 'json_schema', name: 'shopping_alternatives', strict: true, schema } },
      safety_identifier: `shopping_${createHash('sha256').update(userId).digest('hex').slice(0, 24)}`,
    }) });
    if (!response.ok) return local;
    const payload = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
    const parsed = resultSchema.safeParse(JSON.parse(outputText(payload)));
    return parsed.success ? { ...parsed.data, usedAI: true } : local;
  } catch { return local; }
}
