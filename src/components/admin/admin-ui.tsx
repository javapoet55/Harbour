import type { ReactNode } from 'react';
import type { TrendPoint } from '@/server/admin-analytics';

export function PageHeading({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <header className="admin-page-heading"><div><h1>{title}</h1><p>{description}</p></div>{children}</header>;
}

export function DatePill({ days }: { days: number }) {
  return <span className="admin-date-pill">Last {days} days</span>;
}

export function MetricCard({ icon, value, label, change, note, action }: { icon: ReactNode; value: string; label: string; change?: number; note?: string; action?: ReactNode }) {
  return <article className="admin-metric-card">
    <div className="admin-metric-icon">{icon}</div>
    {action}
    <div className="admin-metric-copy"><strong>{value}</strong><span>{label}</span>{change !== undefined && <small className={change >= 0 ? 'positive' : 'negative'}>{change >= 0 ? '↑' : '↓'} {Math.abs(change)}% <em>vs. previous period</em></small>}{note && <small>{note}</small>}</div>
  </article>;
}

export function Panel({ title, action, className = '', children }: { title: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return <section className={`admin-panel ${className}`}><div className="admin-panel-head"><h2>{title}</h2>{action}</div>{children}</section>;
}

function pointsFor(data: TrendPoint[], width = 680, height = 190) {
  const values = data.map((point) => point.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  return data.map((point, index) => ({
    x: data.length === 1 ? width / 2 : (index / (data.length - 1)) * width,
    y: height - 14 - ((point.value - min) / range) * (height - 35),
    ...point,
  }));
}

export function LineChart({ data, color = '#1575f6', valueLabel }: { data: TrendPoint[]; color?: string; valueLabel?: string }) {
  const points = pointsFor(data);
  const path = points.map((point) => `${point.x},${point.y}`).join(' ');
  const first = data[0]?.label ?? '';
  const middle = data[Math.floor(data.length / 2)]?.label ?? '';
  const last = data.at(-1)?.label ?? '';
  return <div className="admin-chart-wrap">
    <svg className="admin-line-chart" viewBox="0 0 680 210" role="img" aria-label={valueLabel ?? 'Trend chart'} preserveAspectRatio="none">
      {[40, 80, 120, 160].map((y) => <line key={y} x1="0" y1={y} x2="680" y2={y} className="chart-grid" />)}
      <defs><linearGradient id={`fill-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".25"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
      {points.length > 1 && <polygon points={`0,190 ${path} 680,190`} fill={`url(#fill-${color.replace('#', '')})`} />}
      <polyline points={path} fill="none" stroke={color} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="4" fill={color}><title>{point.label}: {point.value}</title></circle>)}
    </svg>
    <div className="chart-labels"><span>{first}</span><span>{middle}</span><span>{last}</span></div>
  </div>;
}

export function BarChart({ data, color = '#5d45e8' }: { data: TrendPoint[]; color?: string }) {
  const max = Math.max(...data.map((point) => point.value), 1);
  return <div className="admin-bars" role="img" aria-label="Usage by day">{data.map((point, index) => <div key={`${point.label}-${index}`} className="admin-bar-slot"><div className="admin-bar" style={{ height: `${Math.max(4, (point.value / max) * 100)}%`, background: color }} title={`${point.label}: ${point.value}`} /></div>)}</div>;
}

export function Donut({ values, colors, center, label }: { values: number[]; colors: string[]; center: string; label: string }) {
  const total = values.reduce((sum, value) => sum + value, 0) || 1;
  const gradient = values.map((value, index) => {
    const start = values.slice(0, index).reduce((sum, item) => sum + item, 0) / total * 100;
    const end = start + (value / total) * 100;
    return `${colors[index]} ${start}% ${end}%`;
  }).join(', ');
  return <div className="admin-donut" style={{ background: `conic-gradient(${gradient})` }} role="img" aria-label={label}><div><strong>{center}</strong><span>{label}</span></div></div>;
}

export function ProgressList({ rows }: { rows: Array<{ label: string; value: number; color: string }> }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return <div className="admin-progress-list">{rows.map((row) => <div className="admin-progress-row" key={row.label}><div><span>{row.label}</span><strong>{row.value.toLocaleString()}</strong></div><div className="admin-progress-track"><span style={{ width: `${Math.max(2, (row.value / max) * 100)}%`, background: row.color }} /></div></div>)}</div>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="admin-empty">{children}</div>;
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', { notation: value >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}
