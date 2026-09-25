import { categories, categoryFor } from './domain';
import { FoodFacts, FoodQuery, compare } from './food/model';
import { productData } from './food/service';
import { explain } from './food/explanation';
export type ShoppingAlternative = { name: string; category: typeof categories[number]; quantity: string; size: string; reason: string; detail: string; facts?: FoodFacts; whyThisSwap?: string };
export type ShoppingAlternatives = { alternatives: ShoppingAlternative[]; tip: string; usedAI: boolean; originalFacts?: FoodFacts };

const curated: Array<[RegExp, Omit<ShoppingAlternatives, 'usedAI'>]> = [
  [/chicken(?: breast)?/i, { alternatives: [
    { name: 'Chicken breast (skinless)', category: 'Meat & Seafood', quantity: '1', size: 'lb', reason: 'Lower in calories', detail: 'Lean cut with less saturated fat' },
    { name: 'Turkey breast', category: 'Meat & Seafood', quantity: '1', size: 'lb', reason: 'Lean protein', detail: 'Mild flavor and lower in fat' },
    { name: 'Salmon', category: 'Meat & Seafood', quantity: '1', size: 'lb', reason: 'Heart healthy', detail: 'Rich in omega-3 fatty acids' },
    { name: 'Firm tofu', category: 'Produce', quantity: '1', size: 'package', reason: 'Plant-based alternative', detail: 'Versatile source of protein' },
    { name: 'Chickpeas', category: 'Pantry', quantity: '2', size: 'cans', reason: 'High fiber option', detail: 'Plant-based protein with fiber' },
  ], tip: 'Try turkey breast for a lean swap with a similar mild flavor.' }],
  [/whole milk|milk 2%|milk/i, { alternatives: [
    { name: '2% milk', category: 'Dairy & Eggs', quantity: '1', size: 'gallon', reason: 'Lower fat option', detail: 'Similar dairy taste with less fat' },
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

export async function recommendShoppingAlternatives(_userId: string, input: FoodQuery & { category?: string; quantity?: string; goal?: string }): Promise<ShoppingAlternatives> {
  const category = categories.includes(input.category as typeof categories[number]) ? input.category as typeof categories[number] : categoryFor(input.name);
  const local = fallback(input.name, category, input.quantity?.trim() || '1', input.size?.trim() || '');
  const [original, ...facts] = category==='Household' ? [null,...local.alternatives.map(()=>null)] : await Promise.all([productData.lookup(input), ...local.alternatives.map(item=>productData.lookup({name:item.name}))]);
  let usedAI = false;
  const alternatives = await Promise.all(local.alternatives.map(async (item,index)=>{
    const fact = facts[index];
    const explanation = await explain(original,fact,input.goal||'Lower fat');
    usedAI ||= explanation.usedAI;
    return {...item, reason: 'Suggested alternative', detail: explanation.text, whyThisSwap: explanation.text, ...(fact?{facts:fact}:{}), nutritionUnavailable: !fact?.nutrition, nutritionComparison:compare(original,fact)};
  }));
  return {...local, alternatives, tip:'Compare source information and product labels before replacing an item.', usedAI, ...(original?{originalFacts:original}:{})};
}
