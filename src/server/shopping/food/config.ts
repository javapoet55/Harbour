const seconds = (name: string, fallback: number) => {const v=Number(process.env[name]);return Number.isFinite(v)&&v>0?Math.min(v,90*86400):fallback;};
export function foodConfig() {
  return { exactTTL:seconds('FOOD_EXACT_TTL_SECONDS',14*86400),genericTTL:seconds('FOOD_GENERIC_TTL_SECONDS',30*86400),
    searchTTL:seconds('FOOD_SEARCH_TTL_SECONDS',86400),negativeTTL:seconds('FOOD_NEGATIVE_TTL_SECONDS',3600),
    explanationTTL:seconds('FOOD_EXPLANATION_TTL_SECONDS',7*86400),staleTTL:seconds('FOOD_STALE_TTL_SECONDS',2*86400),
    timeoutMs:Math.min(seconds('FOOD_TIMEOUT_SECONDS',8),10)*1000 };
}
