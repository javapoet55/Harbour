/** Local navigation for the public, explicitly simulated product walkthrough. */
export function matchLandingStory(prompt: string): 'focus' | 'replan' | 'brief' | null {
  const text = prompt.trim().toLowerCase();
  if (/meeting|move|replan|change|room|delay/.test(text)) return 'replan';
  if (/brief|week|tomorrow|overview|deadline/.test(text)) return 'brief';
  if (/focus|priorit|today|start/.test(text)) return 'focus';
  return null;
}
