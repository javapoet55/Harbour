'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarHeart, ChevronRight, Gift, Heart, HeartPulse, Mail, PartyPopper, Plus, Search, Sparkles } from 'lucide-react';
import { MOMENT_TYPES, dayLabel, displayedMoments, emailBlocker, momentState, relativeDay, typeLabel, type ImportantMoment, type MomentsTab } from '@/lib/moments';
import { useMoments } from './use-moments';
import { MomentFormSheet } from './moments-sheets';
import { MomentDetailSheet } from './moments-detail';
import './tasks-screen.css';
import './moments.css';

const TABS: MomentsTab[] = ['Upcoming', 'Scheduled', 'Sent'];

function TypeIcon({ type }: { type: string }) {
  const props = { size: 26, 'aria-hidden': true as const };
  switch (type) {
    case 'birthday': return <Gift {...props} />;
    case 'anniversary': return <Heart {...props} />;
    case 'festival': return <PartyPopper {...props} />;
    case 'getWellSoon': return <HeartPulse {...props} />;
    default: return <CalendarHeart {...props} />;
  }
}

function MomentCard({ moment, onOpen }: { moment: ImportantMoment; onOpen: () => void }) {
  const state = momentState(moment);
  return <button type="button" className="sp-list-card mo-card" onClick={onOpen}>
    <TypeIcon type={moment.type} />
    <span>
      <strong>{moment.title}</strong>
      <small>{typeLabel(moment.type)} · {dayLabel(moment.nextOccurrence)} · {relativeDay(moment.nextOccurrence, moment.timeZoneID)}</small>
      <small className={`mo-state is-${state.state}`}>{state.label}</small>
    </span>
    <ChevronRight size={20} aria-hidden="true" />
  </button>;
}

/** The signed-in Important Moments page: Upcoming, Scheduled and Sent, add and edit, the wish and its automatic email. */
export function MomentsScreen() {
  const moments = useMoments();
  const { refresh } = moments;
  const [tab, setTab] = useState<MomentsTab>('Upcoming');
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [openID, setOpenID] = useState<string | null>(null);
  const [form, setForm] = useState<{ moment: ImportantMoment | null } | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const shown = useMemo(() => displayedMoments(moments.moments, { tab, filter, search }), [moments.moments, tab, filter, search]);
  const blocker = emailBlocker(moments);

  async function save(input: Parameters<typeof moments.save>[0], id?: string) {
    const result = await moments.save(input, id);
    if (!result.ok) return false;
    setForm(null);
    if (!id) setOpenID(result.value.moment.id);
    return true;
  }

  return <main className="nx-tasks">
    <div className="nx-header">
      <div><h1>Important Moments</h1><p>Birthdays and occasions, with wishes ready when the day comes.</p></div>
      <button type="button" className="nx-icon-button" aria-label="Add moment" onClick={() => { moments.clearError(); setForm({ moment: null }); }}><Plus size={22} aria-hidden="true" /></button>
    </div>

    {moments.loaded && !moments.loadError && <div className={`mo-email ${blocker ? '' : 'is-ready'}`} role="status">
      <Mail size={18} aria-hidden="true" />
      <p>{blocker ?? `Automatic emails send from ${moments.emailAccount?.email}.`}</p>
    </div>}

    <div className="nx-segments" role="tablist" aria-label="Moments">
      {TABS.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item}</button>)}
    </div>
    <div className="mo-filters">
      <label className="nx-search"><Search size={18} aria-hidden="true" /><input type="search" aria-label="Search moments" placeholder="Search moments" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <select aria-label="Occasion" className="nx-field mo-filter" value={filter} onChange={(event) => setFilter(event.target.value)}>
        <option value="All">All occasions</option>
        {MOMENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
      </select>
    </div>

    {!moments.loaded && <p className="nx-status" role="status">Loading your moments…</p>}
    {moments.loaded && moments.loadError && <div className="nx-error" role="alert">{moments.loadError}<button type="button" onClick={() => void refresh()}>Retry</button></div>}
    {moments.loaded && !moments.loadError && shown.length === 0 && <div className="nx-status">
      <Sparkles size={40} aria-hidden="true" />
      <h2>{moments.moments.length === 0 ? 'No moments yet' : `Nothing under ${tab}`}</h2>
      <p>{moments.moments.length === 0 ? 'Add a birthday or anniversary and Nexdo helps you send the wish on time.' : 'Try another tab, or clear the search and filter.'}</p>
      {moments.moments.length === 0 && <button type="button" className="nx-outline-button" onClick={() => setForm({ moment: null })}><Plus size={16} aria-hidden="true" /> Add moment</button>}
    </div>}
    {shown.length > 0 && <div className="sp-lists">{shown.map((moment) => <MomentCard key={moment.id} moment={moment} onOpen={() => { moments.clearError(); setOpenID(moment.id); }} />)}</div>}

    {openID && !form && <MomentDetailSheet momentID={openID} moments={moments} onEdit={(moment) => { moments.clearError(); setForm({ moment }); }} onClose={() => setOpenID(null)} />}
    {form && <MomentFormSheet moment={form.moment} busy={moments.busy} error={moments.error} onSave={save} onClose={() => setForm(null)} />}
  </main>;
}
