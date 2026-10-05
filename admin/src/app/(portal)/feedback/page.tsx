import Link from 'next/link';
import { z } from 'zod';
import { adminData } from '@/server/admin-data';
import { PageHeading, Panel } from '@/components/admin/admin-ui';
const schema = z.object({ feedback: z.array(z.object({ id: z.string(), customerName: z.string(), title: z.string(), description: z.string(), stars: z.number().int().min(1).max(5), createdAt: z.string().datetime() })), nextCursor: z.string().nullable() });
export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const { cursor } = await searchParams;
  const validCursor = cursor && z.string().uuid().safeParse(cursor).success ? cursor : undefined;
  const data = await adminData('/api/admin/feedback' + (validCursor ? `?cursor=${encodeURIComponent(validCursor)}` : ''), schema);
  return <>
    <PageHeading title="Feedback" description="Customer feedback, sorted by date with the newest submissions first." />
    <Panel title="Customer feedback">
      {data.feedback.length === 0 ? <p>No feedback submitted yet.</p> : <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead><tr>{['Customer name', 'Title', 'Description', 'Date given (UTC) ↓', 'Stars'].map(label => <th key={label} scope="col" style={{ padding: 12, borderBottom: '1px solid #ddd' }}>{label}</th>)}</tr></thead>
          <tbody>{data.feedback.map(item => <tr key={item.id}>
            <td style={{ padding: 12, verticalAlign: 'top' }}>{item.customerName}</td>
            <td style={{ padding: 12, verticalAlign: 'top', overflowWrap: 'anywhere' }}>{item.title}</td>
            <td style={{ padding: 12, verticalAlign: 'top', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', minWidth: 240 }}>{item.description}</td>
            <td style={{ padding: 12, verticalAlign: 'top', whiteSpace: 'nowrap' }}><time dateTime={item.createdAt}>{new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(item.createdAt))}</time></td>
            <td style={{ padding: 12, verticalAlign: 'top', whiteSpace: 'nowrap' }} aria-label={`${item.stars} out of 5 stars`}><span style={{ color: '#a65f00' }} aria-hidden="true">{'★'.repeat(item.stars)}{'☆'.repeat(5 - item.stars)}</span> {item.stars}/5</td>
          </tr>)}</tbody>
        </table>
      </div>}
      <nav aria-label="Feedback pages" style={{ display: 'flex', gap: 24, marginTop: 20 }}>
        {validCursor && <Link href="/feedback">Latest feedback</Link>}
        {data.nextCursor && <Link href={`/feedback?cursor=${encodeURIComponent(data.nextCursor)}`}>Older feedback →</Link>}
      </nav>
    </Panel>
  </>;
}
