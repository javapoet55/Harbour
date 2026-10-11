/** Decode the provider's SSE speech response back to the MP3 body expected by existing clients. */
export async function speechAudio(response: Response): Promise<Uint8Array> {
  if (!response.headers.get('content-type')?.includes('text/event-stream')) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing speech stream');
  const decoder = new TextDecoder(); const chunks: Buffer[] = [];
  let pending = '', size = 0, done = false;
  const event = (block: string) => {
    const data = block.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return;
    const value = JSON.parse(data);
    if (value.type === 'error') throw new Error('Speech stream failed');
    if (value.type === 'speech.audio.delta' || value.type === 'audio.delta') {
      if (typeof value.audio !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.audio)) throw new Error('Invalid speech audio');
      const chunk = Buffer.from(value.audio, 'base64'); size += chunk.length;
      if (size > 8 * 1024 * 1024) throw new Error('Speech response too large');
      chunks.push(chunk);
    }
    if (value.type === 'speech.audio.done' || value.type === 'audio.done') done = true;
  };
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      pending += decoder.decode(part.value,{stream:true}).replace(/\r/g,'');
      if (pending.length > 12 * 1024 * 1024) throw new Error('Speech event too large');
      let end: number; while ((end = pending.indexOf('\n\n')) >= 0) { event(pending.slice(0,end)); pending = pending.slice(end+2); }
    }
    if (pending.trim()) event(pending);
    if (!done || !size) throw new Error('Incomplete speech response');
    return new Uint8Array(Buffer.concat(chunks));
  } finally { void reader.cancel().catch(()=>{}); }
}
