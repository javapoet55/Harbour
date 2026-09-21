const privateKey = /secret|token|password|authorization|cookie|api.?key|prompt|conversation|transcript|recording|email|recipient|contact|description|body|payload|headers/i;
export function redactStructured(value:unknown, depth=0):unknown {
 if(depth>6)return '[redacted]';
 if(Array.isArray(value))return value.slice(0,100).map(v=>redactStructured(v,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,privateKey.test(key)?'[redacted]':redactStructured(entry,depth+1)]));
 if(typeof value==='string')return value.replace(/Bearer\s+\S+/gi,'Bearer [redacted]').replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[email]').replace(/\bsk-[a-z0-9_-]+/gi,'[redacted]');
 return value;
}
