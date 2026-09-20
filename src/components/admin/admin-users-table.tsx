'use client';

import { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import type { AdminPlan } from '@/server/admin-analytics';

type UserRow = { id: string; name: string; email: string; plan: AdminPlan; city: string | null; country: string | null; timeZone: string; createdAt: string; lastActiveAt: string; aiActions: number; voiceMinutes: number; verified: boolean };
const pageSize = 12;

function date(value: string) { return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }

export function AdminUsersTable({ users }: { users: UserRow[] }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => users.filter((user) => `${user.name} ${user.email} ${user.plan} ${user.city ?? ''} ${user.country ?? ''}`.toLowerCase().includes(query.toLowerCase())), [query, users]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((Math.min(page, pages) - 1) * pageSize, Math.min(page, pages) * pageSize);

  function exportCsv() {
    const escaped = (value: string | number | boolean) => `"${String(value).replaceAll('"', '""')}"`;
    const csv = [['Name', 'Email', 'Plan', 'City', 'Country', 'Time zone', 'Sign up date', 'Last activity', 'AI actions', 'Voice minutes', 'Verified'], ...filtered.map((user) => [user.name, user.email, user.plan, user.city ?? '', user.country ?? '', user.timeZone, user.createdAt, user.lastActiveAt, user.aiActions, user.voiceMinutes, user.verified])].map((row) => row.map(escaped).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `nexdo-users-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return <>
    <div className="admin-table-tools"><label><Search size={18}/><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search by name, email, plan, city, or country" /></label><button onClick={exportCsv}><Download size={17}/> Export CSV</button></div>
    <div className="admin-table-scroll"><table className="admin-table admin-users-table"><thead><tr><th>User</th><th>Plan</th><th>City</th><th>Country</th><th>Sign up date</th><th>Last activity</th><th>AI actions</th><th>Voice minutes</th><th>Status</th></tr></thead><tbody>
      {rows.map((user) => <tr key={user.id}><td><div className="admin-user-cell"><span>{user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div></td><td><span className={`admin-plan plan-${user.plan.toLowerCase()}`}>{user.plan === 'MAX' ? 'Max' : user.plan === 'PRO' ? 'Pro' : 'Free'}</span></td><td>{user.city ?? <span className="admin-missing-data">Not provided</span>}</td><td>{user.country ?? <span className="admin-missing-data">Not provided</span>}</td><td>{date(user.createdAt)}</td><td>{date(user.lastActiveAt)}</td><td>{user.aiActions.toLocaleString()}</td><td>{user.voiceMinutes.toFixed(1)}</td><td><span className={`admin-status ${user.verified ? '' : 'pending'}`}>{user.verified ? 'Verified' : 'Unverified'}</span></td></tr>)}
      {!rows.length && <tr><td colSpan={9} className="admin-no-results">No users match this search.</td></tr>}
    </tbody></table></div>
    <div className="admin-pagination"><span>Showing {filtered.length ? (Math.min(page, pages) - 1) * pageSize + 1 : 0}–{Math.min(Math.min(page, pages) * pageSize, filtered.length)} of {filtered.length}</span><div><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><strong>{Math.min(page, pages)} / {pages}</strong><button disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>
  </>;
}
