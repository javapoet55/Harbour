import { ScreenshotPreview } from './screenshot-preview';
import Link from 'next/link';
import { BugStatusSelect } from './bug-status-select';
import { bugStatuses } from './bug-status';
import { backendFetch } from '@/server/backend';
import { sessionToken } from '@/server/session';
import { z } from 'zod';
import { adminData } from '@/server/admin-data';
import { PageHeading, Panel } from '@/components/admin/admin-ui';

const schema = z.object({ bugs: z.array(z.object({
  id: z.string().uuid(), reference: z.string(), description: z.string(), createdAt: z.string().datetime(),
  status: z.enum(bugStatuses).default('open'), hasScreenshot: z.boolean(), metadata: z.object({
    appVersion: z.string(), buildNumber: z.string(), deviceModel: z.string(), iosVersion: z.string(), screen: z.string(), platform: z.literal('web').optional(),
  }).nullable(),
})), nextCursor: z.string().nullable() });

export default async function BugReportsPage({ searchParams }: { searchParams: Promise<{ cursor?: string; sort?: string; direction?: string }> }) {
  const { cursor, sort, direction } = await searchParams;
  const validCursor = cursor && z.string().uuid().safeParse(cursor).success ? cursor : undefined;
  const sortByApp = sort === 'app';
  const ascending = direction === 'asc';
  const params = new URLSearchParams();
  if (validCursor) params.set('cursor', validCursor);
  if (sortByApp) params.set('sort', 'app');
  if (ascending) params.set('direction', 'asc');
  const data = await adminData('/api/admin/feedback/bugs' + (params.size ? `?${params}` : ''), schema);
  const bugs = data.bugs;
  const pageUrl = (next?: string | null) => {
    const query = new URLSearchParams();
    if (sortByApp) query.set('sort', 'app');
    if (ascending) query.set('direction', 'asc');
    if (next) query.set('cursor', next);
    return '/bug-reports' + (query.size ? `?${query}` : '');
  };
  async function changeStatus(reportID: string, value: string) {
    'use server';
    const token = await sessionToken();
    const id = z.string().uuid().safeParse(reportID);
    const status = z.enum(bugStatuses).safeParse(value);
    if (!token || !id.success || !status.success) return false;
    try {
      const response = await backendFetch('/api/admin/feedback/bugs', {
        method: 'PATCH', token, body: { id: id.data, status: status.data },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
  const arrow = ascending ? '↑' : '↓';
  return <div className="admin-bug-report">
    <PageHeading title="Bug Reports" description="Submitted bug tickets. Reports are retained for 90 days; screenshots for 7 days.">
      <a className="admin-bug-action" href={pageUrl()}>Refresh reports</a>
    </PageHeading>
    <p className="admin-callout" role="note"><span>Reports stay in the environment where they were submitted. Xcode Debug builds send reports to{' '}
      <a href="https://admin-dev.nexdoapp.com/bug-reports">Development Bug Reports</a>.
      {' '}Release builds send reports to <a href="https://admin.nexdoapp.com/bug-reports">Production Bug Reports</a>.
    </span></p>
    <Panel title="Submitted bugs">
      {bugs.length === 0 ? <p>No bug reports submitted yet.</p> : <>
        <div className="admin-table-scroll">
          <table className="admin-table admin-bug-table">
            <thead><tr>
              <th scope="col">Ticket</th><th scope="col">Description</th>
              <th scope="col" aria-sort={sortByApp ? (ascending ? 'ascending' : 'descending') : undefined}>
                <Link href={'?sort=app&direction=' + (sortByApp && ascending ? 'desc' : 'asc')}>App <span aria-hidden="true">{sortByApp ? arrow : '↕'}</span></Link>
              </th>
              <th scope="col">Device</th>
              <th scope="col" aria-sort={!sortByApp ? (ascending ? 'ascending' : 'descending') : undefined}>
                <Link href={(!sortByApp && !ascending) ? '?direction=asc' : '/bug-reports'}>Submitted (UTC) <span aria-hidden="true">{sortByApp ? '↕' : arrow}</span></Link>
              </th>
              <th scope="col">Screenshot</th><th scope="col">Status</th>
            </tr></thead>
            <tbody>{bugs.map(bug => <tr key={bug.id}>
              <th scope="row">{bug.reference}</th>
              <td className="admin-bug-description">{bug.description}</td>
              <td>{bug.metadata ? <><strong className="admin-bug-app">{bug.metadata.screen}</strong><small>{bug.metadata.platform === 'web' ? `Support chat · ${bug.metadata.buildNumber}` : `v${bug.metadata.appVersion} (${bug.metadata.buildNumber})`}</small></> : 'Unavailable'}</td>
              <td>{bug.metadata ? <>{bug.metadata.deviceModel}{bug.metadata.platform !== 'web' && <small>iOS {bug.metadata.iosVersion}</small>}</> : 'Unavailable'}</td>
              <td><time dateTime={bug.createdAt}>{new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(bug.createdAt))}</time></td>
              <td>{bug.hasScreenshot ? <ScreenshotPreview id={bug.id} reference={bug.reference}/> : 'Not attached or expired'}</td>
              <td><BugStatusSelect key={bug.status} reference={bug.reference} status={bug.status} saveAction={changeStatus.bind(null, bug.id)}/></td>
            </tr>)}</tbody>
          </table>
        </div>
      </>}
      <nav aria-label="Bug report pages" className="admin-bug-pages">
        {validCursor && <Link href={pageUrl()}>{!sortByApp && !ascending ? 'Latest reports' : 'First page'}</Link>}
        {data.nextCursor && <Link href={pageUrl(data.nextCursor)}>{sortByApp ? 'Next page →' : ascending ? 'Newer reports →' : 'Older reports →'}</Link>}
      </nav>
    </Panel>
  </div>;
}
