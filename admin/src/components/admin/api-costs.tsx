import { Panel } from './admin-ui';
import { usd } from '@/lib/voice-costs';
import type { ApiCostReport } from '@/contract/api-costs';
import type { VoiceTokenRow } from '@/contract/voice-tokens';
export function ApiCosts({ rows, realtime }: { rows: ApiCostReport; realtime: VoiceTokenRow[] }) {
  const apiPriced = rows.reduce((n, r) => n + r.pricedRequests, 0);
  const rtPriced = realtime.reduce((n, r) => n + r.pricedRecords, 0);
  const apiCost = rows.reduce((n, r) => n + (r.costUsd ?? 0), 0);
  const rtCost = realtime.reduce((n, r) => n + r.textCostUsd + r.audioCostUsd, 0);
  const unknown = rows.reduce((n, r) => n + r.requests - r.pricedRequests, 0) + realtime.reduce((n, r) => n + r.unpricedRecords, 0);
  return <Panel title="AI and voice API costs">
    <p><strong>Combined known estimate: {usd(apiPriced + rtPriced ? apiCost + rtCost : null)}</strong></p>
    <p className="admin-note">Realtime: {usd(rtPriced ? rtCost : null)} · General AI and other APIs: {usd(apiPriced ? apiCost : null)}. {unknown} records have unavailable costs. This is a partial estimate when coverage is incomplete, not a provider invoice.</p>
    <div className="admin-table-scroll"><table className="admin-list"><thead><tr><th>User</th><th>API</th><th>Feature</th><th>Model</th><th>Requests</th><th>Input / output tokens</th><th>Estimated USD</th><th>Priced coverage</th></tr></thead><tbody>
      {rows.map(r => <tr key={`${r.userId}:${r.operation}:${r.feature}:${r.model}`}><td>{r.user}</td><td>{r.operation}</td><td>{r.feature}</td><td>{r.model}</td><td>{r.requests}</td><td>{r.inputTokens?.toLocaleString() ?? 'Unavailable'} / {r.outputTokens?.toLocaleString() ?? 'Unavailable'}</td><td>{usd(r.costUsd)}</td><td>{r.pricedRequests}/{r.requests}</td></tr>)}
    </tbody></table>{!rows.length && <p>No server API requests recorded for this date range.</p>}</div>
    <p className="admin-note">Twilio telephony, optional Deepgram transcription, and noise-filter licensing are not included.</p>
    <p className="admin-note">Server calls are recorded from deployment onward, independently of health monitoring. Includes general AI, speech generation, uploaded-audio transcription and image generation. Realtime session setup is excluded to avoid double counting the receipts below. Missing provider usage, failed calls, and unconfigured model prices remain unavailable. Speech generation uses provider-reported streaming usage when available; responses without billing usage remain unpriced.</p>
  </Panel>;
}
