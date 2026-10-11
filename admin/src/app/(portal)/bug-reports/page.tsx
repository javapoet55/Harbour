import Link from 'next/link';
import { z } from 'zod';
import { adminData } from '@/server/admin-data';
import { PageHeading, Panel } from '@/components/admin/admin-ui';

const schema = z.object({ bugs: z.array(z.object({
  id: z.string().uuid(), reference: z.string(), description: z.string(), createdAt: z.string().datetime(),
  hasScreenshot: z.boolean(), metadata: z.object({
    appVersion: z.string(), buildNumber: z.string(), deviceModel: z.string(), iosVersion: z.string(), screen: z.string(),
  }).nullable(),
})), nextCursor: z.string().nullable() });

export default async function BugReportsPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const { cursor } = await searchParams;
  const validCursor = cursor && z.string().uuid().safeParse(cursor).success ? cursor : undefined;
  const data = await adminData('/api/admin/feedback/bugs' + (validCursor ? `?cursor=${encodeURIComponent(validCursor)}` : ''), schema);
  return <>
    <PageHeading title="Bug Reports" description="Submitted bug tickets, newest first. Reports are retained for 90 days; screenshots for 7 days.">
      <a href="/bug-reports">Refresh reports</a>
    </PageHeading>
    <Panel title="Submitted bugs">
      {data.bugs.length === 0 ? <p>No bug reports submitted yet.</p> : <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead><tr>{['Ticket', 'Description', 'App & device', 'Submitted (UTC)', 'Screenshot'].map(label => <th key={label} scope="col" style={{ padding: 12 }}>{label}</th>)}</tr></thead>
          <tbody>{data.bugs.map(bug => <tr key={bug.id}>
            <td style={{ padding: 12, verticalAlign: 'top', whiteSpace: 'nowrap' }}>{bug.reference}</td>
            <td style={{ padding: 12, verticalAlign: 'top', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', minWidth: 240 }}>{bug.description}</td>
            <td style={{ padding: 12, verticalAlign: 'top' }}>{bug.metadata ? <>
              <div>{bug.metadata.screen}</div><div>v{bug.metadata.appVersion} ({bug.metadata.buildNumber})</div>
              <div>{bug.metadata.deviceModel} · iOS {bug.metadata.iosVersion}</div>
            </> : 'Details unavailable'}</td>
            <td style={{ padding: 12, verticalAlign: 'top', whiteSpace: 'nowrap' }}><time dateTime={bug.createdAt}>{new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(bug.createdAt))}</time></td>
            <td style={{ padding: 12, verticalAlign: 'top' }}>{bug.hasScreenshot ? <a href={`/api/admin/feedback/bugs/${bug.id}/screenshot`} target="_blank" rel="noopener noreferrer">View screenshot</a> : 'Not attached or expired'}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      <nav aria-label="Bug report pages" style={{ display: 'flex', gap: 24, marginTop: 20 }}>
        {validCursor && <Link href="/bug-reports">Latest reports</Link>}
        {data.nextCursor && <Link href={`/bug-reports?cursor=${encodeURIComponent(data.nextCursor)}`}>Older reports →</Link>}
      </nav>
    </Panel>
  </>;
}
