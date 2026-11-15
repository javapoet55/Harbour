import { AdminDateRangeFilter } from '@/components/admin/admin-date-range-filter';
import { LineChart, PageHeading, Panel } from '@/components/admin/admin-ui';
import { qrAnalyticsSchema } from '@/contract/qr-analytics';
import { adminDateRangeLabel, parseAdminDateRange } from '@/lib/admin-date-range';
import { adminData } from '@/server/admin-data';

const platformNames = { android: 'Android', ios: 'iOS', other: 'Other' };
const destinations = { android: 'Google Play', ios: 'App Store', other: 'Store links' };
const regions = new Intl.DisplayNames(['en'], { type: 'region' });
const dateTime = new Intl.DateTimeFormat('en-US', {
  year: 'numeric', month: 'short', day: 'numeric',
  hour: 'numeric', minute: '2-digit', second: '2-digit',
  timeZone: 'America/Los_Angeles', timeZoneName: 'short',
});
const number = new Intl.NumberFormat('en-US');

type Location = { city: string | null; region: string | null; country: string | null };
function locationLabel({ city, region, country }: Location) {
  return [city, region, country && regions.of(country)].filter(Boolean).join(', ') || 'Unknown';
}

function Breakdown({ title, label, rows }: {
  title: string;
  label: string;
  rows: { name: string; count: number }[];
}) {
  return <Panel title={title} className="admin-span-4">
    <div className="admin-table-scroll">
      <table className="admin-table admin-qr-breakdown">
        <thead><tr><th scope="col">{label}</th><th scope="col">Opens</th></tr></thead>
        <tbody>
          {rows.length ? rows.map(row => <tr key={row.name}><td>{row.name}</td><td>{number.format(row.count)}</td></tr>)
            : <tr><td colSpan={2}>No QR opens in this date range.</td></tr>}
        </tbody>
      </table>
    </div>
  </Panel>;
}

export default async function QrAnalyticsPage({ searchParams }: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const query = await searchParams;
  const range = parseAdminDateRange(query.from, query.to);
  const today = new Date().toISOString().slice(0, 10);
  const data = await adminData(`/api/admin/qr-analytics?from=${range.from}&to=${range.to}`, qrAnalyticsSchema);
  return <div className="admin-qr-report">
    <PageHeading title="QR Code Analytics" description="Opens of the NexDo homepage QR link. Daily counts and date filters use UTC. Recent opens use Pacific time.">
      <AdminDateRangeFilter from={range.from} to={range.to} today={today} label={adminDateRangeLabel(range)} pathname="/qr-analytics"/>
    </PageHeading>
    <p className="admin-callout">Locations are estimated. Device models appear when browsers provide them. Repeat opens can count separately.</p>
    <div className="admin-grid">
    <Panel title={`${number.format(data.total)} QR ${data.total === 1 ? "open" : "opens"}`} className="admin-span-12">
      <div className="admin-qr-chart">
        <LineChart data={data.days.map(({ day, count }) => ({ label: day, value: count }))} valueLabel="QR opens per UTC day"/>
      </div>
    </Panel>
    <Breakdown title="Platforms and store destinations" label="Platform and destination"
      rows={data.platforms.map(({ platform, count }) => ({ name: `${platformNames[platform]} · ${destinations[platform]}`, count }))}/>
    <Breakdown title="Top locations" label="City, state or region, country"
      rows={data.locations.map((row) => ({ name: locationLabel(row), count: row.count }))}/>
    <Breakdown title="Top devices" label="Platform and model"
      rows={data.devices.map(({ platform, model, count }) => ({ name: `${platformNames[platform]} · ${model || 'Model unknown'}`, count }))}/>
    <Panel title="Recent opens" className="admin-span-12">
      <p>Up to 100 opens in the selected date range.</p>
      <div className="admin-table-scroll">
        <table className="admin-table">
          <thead><tr><th scope="col">Opened (Pacific time)</th><th scope="col">City</th><th scope="col">State or region</th><th scope="col">Country</th><th scope="col">Platform</th><th scope="col">Phone model</th><th scope="col">Destination</th></tr></thead>
          <tbody>
            {data.recent.length ? data.recent.map(row => <tr key={row.id}>
              <td><time dateTime={row.openedAt}>{dateTime.format(new Date(row.openedAt))}</time></td>
              <td>{row.city || 'Unknown'}</td><td>{row.region || 'Unknown'}</td>
              <td>{row.country ? regions.of(row.country) : 'Unknown'}</td>
              <td>{platformNames[row.platform]}</td><td>{row.model || 'Unknown'}</td><td>{destinations[row.platform]}</td>
            </tr>) : <tr><td colSpan={7}>No QR opens in this date range.</td></tr>}
          </tbody>
        </table>
      </div>
    </Panel>
    </div>
  </div>;
}
