// Read only approved public product content; never crawl account pages or internal docs.
import ts from 'typescript';
import { readFileSync, writeFileSync } from 'node:fs';
const articles = [];
function parse(file) { return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); }
function literal(n) {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isAsExpression(n)) return literal(n.expression);
  if (ts.isArrayLiteralExpression(n)) return n.elements.map(literal);
  if (ts.isObjectLiteralExpression(n)) return Object.fromEntries(n.properties.filter(ts.isPropertyAssignment).map(p => [p.name.getText(), literal(p.initializer)]));
  return null;
}
function variable(tree, name) { let result; function visit(n) { if (ts.isVariableDeclaration(n) && n.name.getText(tree) === name && n.initializer) result = literal(n.initializer); ts.forEachChild(n, visit); } visit(tree); return result; }
function add(id, title, text, url, platform = 'Website', keywords = '') { articles.push({ id, title, text, url, platform, keywords }); }
const pricing = parse('src/components/pricing.tsx');
for (const plan of variable(pricing, 'plans')) add(`plan-${plan.name.toLowerCase().replaceAll(' ', '-')}`, `${plan.name} pricing and features`, `${plan.name}: $${plan.monthly} per month or $${plan.annual} per year. ${plan.description}\n${plan.features.map(f => `${f.name}: ${f.description.join(' ')}`).join('\n')}`, '/pricing', 'Website', 'price cost subscription billing monthly annual');
variable(pricing, 'questions').forEach(([q, a], i) => add(`pricing-faq-${i}`, q, a, '/pricing#faq-title'));
const landing = parse('src/components/harbour-landing.tsx');
function visit(n) {
  if (ts.isJsxElement(n) && n.openingElement.attributes.properties.some(p => ts.isJsxAttribute(p) && p.name.getText() === 'className' && p.initializer && ts.isStringLiteral(p.initializer) && p.initializer.text === 'hs-intro')) add('website-overview', 'What can Nexdo do?', n.children.filter(ts.isJsxText).map(c => c.text.trim()).join(' '), '/welcome', 'Website', 'overview getting started features');
  if (ts.isArrayLiteralExpression(n)) {
    const values = literal(n);
    if (values.length === 2 && values.every(v => typeof v === 'string') && values[0].endsWith('?')) add(`website-faq-${articles.length}`, values[0], values[1], '/welcome#questions');
  }
  ts.forEachChild(n, visit);
}
visit(landing);
for (const [i, f] of variable(parse('src/components/ai-feature-showcase.tsx'), 'features').entries()) add(`feature-${i}`, f.label, `${f.title}. ${f.description} ${f.note} Availability varies by plan and platform; continuous voice and contact actions are featured in the native iOS experience.`, '/features/ai-assistant#product-features');
const help = readFileSync('ios/Sources/NexdoCore/HelpTopics.swift', 'utf8');
const str = '"((?:[^"\\\\]|\\\\.)*)"';
const pattern = new RegExp(`\\.init\\(id: ${str}, category: \\.(\\w+), question: ${str}, answer: ${str}, keywords: ${str}\\)`, 'g');
for (const m of help.matchAll(pattern)) add(m[1], m[3], m[4], `/help#${m[1]}`, 'iPhone app', m[5]);
if (articles.filter(a => a.platform === 'iPhone app').length < 20) throw new Error('Help extraction failed; review HelpTopics format.');
if (new Set(articles.map(a => a.id)).size !== articles.length) throw new Error('Duplicate support article IDs');
writeFileSync('src/content/support-articles.json', JSON.stringify(articles, null, 2) + '\n');
console.log(`Indexed ${articles.length} public website and help articles.`);
