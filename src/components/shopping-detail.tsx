'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Circle, CircleCheck, Copy, MoreHorizontal, Share2, Sparkles, Trash2, CheckCheck, RotateCcw, Settings2, Flag } from 'lucide-react';
import {
  CATEGORIES, appended, completionSummary, groceryEmoji, itemCount, listInput, newItem, amountLabel, remaining, removed, setAllChecked, shortDay,
  suggestionsFor, supportsFoodAlternatives, swapAdding, swapReplacing, toggled, upserted,
  type CompletionSummary, type GroceryItem, type GroceryList, type ShoppingAlternative,
} from '@/lib/shopping';
import { useShopping } from './use-shopping';
import { AlternativesSheet, CompletionDialog, ConfirmDialog, ItemEditorSheet, NewListSheet, ShareSheet, Sheet } from './shopping-sheets';
import './tasks-screen.css';
import './shopping.css';

const SAVE_DELAY_MS = 400;

/** Rename the list, move its date, or turn the weekly repeat on or off. */
function ListSettingsSheet({ list, onSave, onClose }: { list: GroceryList; onSave: (values: { title: string; date: string; weekly: boolean }) => void; onClose: () => void }) {
  const [title, setTitle] = useState(list.title);
  const [date, setDate] = useState(list.date);
  const [weekly, setWeekly] = useState(list.weekly);
  const ok = title.trim() !== '' && date !== '';
  return <Sheet title="List Settings" onClose={onClose} onSubmit={(event) => { event.preventDefault(); if (ok) onSave({ title: title.trim(), date, weekly }); }} footer={<button type="submit" className="nx-primary" disabled={!ok}>Save</button>}>
    <div className="nx-form-card">
      <div><label className="nx-label" htmlFor="sp-set-name">LIST NAME</label><input id="sp-set-name" className="nx-field" required maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} /></div>
      <hr />
      <div><label className="nx-label" htmlFor="sp-set-date">SHOPPING DATE</label><input id="sp-set-date" type="date" className="nx-field" required value={date} onChange={(event) => setDate(event.target.value)} /></div>
      <hr />
      <label className="nx-form-row"><span>Repeat every week</span><input type="checkbox" checked={weekly} onChange={(event) => setWeekly(event.target.checked)} /></label>
    </div>
  </Sheet>;
}

/**
 * One shopping list. Edits apply to a local draft at once and are saved in the background, one write at a
 * time, always against the last revision the server returned; edits made while a save is in flight are sent
 * by the next pass, so none is lost. A failed save keeps the draft and says so.
 */
export function ShoppingDetail({ id }: { id: string }) {
  const router = useRouter();
  const shopping = useShopping();
  const { refresh, action, parse, alternatives, lists, loaded } = shopping;

  const [draft, setDraft] = useState<GroceryList | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const draftRef = useRef<GroceryList | null>(null);
  const baseRef = useRef<GroceryList | null>(null);
  const dirty = useRef(false);
  const flushing = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [quick, setQuick] = useState('');
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState<GroceryItem | null>(null);
  const [altFor, setAltFor] = useState<GroceryItem | null>(null);
  const [sharing, setSharing] = useState(false);
  const [settings, setSettings] = useState(false);
  const [confirm, setConfirm] = useState<'complete' | 'delete' | null>(null);
  const [finished, setFinished] = useState<{ summary: CompletionSummary; next: GroceryList } | null>(null);
  const [copying, setCopying] = useState<GroceryList | null>(null);

  const server = useMemo(() => lists.find((list) => list.id === id) ?? null, [lists, id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Take the server's copy whenever there is nothing of ours left to save.
  useEffect(() => {
    if (!server || dirty.current || flushing.current) return;
    baseRef.current = server;
    draftRef.current = server;
    setDraft(server);
  }, [server]);

  const flush = useCallback((): Promise<boolean> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (flushing.current) return flushing.current;
    if (!dirty.current) return Promise.resolve(true);
    const run = async (): Promise<boolean> => {
      while (dirty.current) {
        const sent = draftRef.current;
        const base = baseRef.current;
        if (!sent || !base) return false;
        dirty.current = false;
        const result = await action('save', base, listInput(sent));
        if (!result.ok || !result.list) {
          dirty.current = true;
          return false;
        }
        baseRef.current = result.list;
      }
      return true;
    };
    setSaving(true);
    const promise = run().then((ok) => {
      flushing.current = null;
      setSaving(false);
      setSaveError(ok ? null : 'Your changes could not be saved.');
      if (ok && baseRef.current) { draftRef.current = baseRef.current; setDraft(baseRef.current); }
      return ok;
    });
    flushing.current = promise;
    return promise;
  }, [action]);

  const edit = useCallback((change: (list: GroceryList) => GroceryList | null) => {
    const current = draftRef.current;
    if (!current || current.completedAt) return;
    const next = change(current);
    if (!next) return;
    draftRef.current = next;
    dirty.current = true;
    setDraft(next);
    setNotice(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  }, [flush]);

  // Save what is pending when leaving the page, and warn if a save has not finished.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty.current || flushing.current) event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => { window.removeEventListener('beforeunload', warn); if (dirty.current) void flush(); };
  }, [flush]);

  const readOnly = draft?.completedAt != null;
  const groups = useMemo(() => {
    if (!draft) return [];
    const names = [...CATEGORIES.filter((category) => draft.items.some((item) => item.category === category)), ...Array.from(new Set(draft.items.map((item) => item.category))).filter((category) => !(CATEGORIES as readonly string[]).includes(category))];
    return names.map((category) => ({ category, items: draft.items.filter((item) => item.category === category) }));
  }, [draft]);

  async function addTyped(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = quick.trim();
    if (!text || adding || readOnly) return;
    setAdding(true);
    let items: GroceryItem[];
    if (/[,\n]| and /i.test(text)) {
      try { items = await parse(text); } catch { items = []; }
      if (items.length === 0) items = text.split(/[,\n]+/).map((part) => part.trim()).filter(Boolean).map((name) => ({ ...newItem(crypto.randomUUID()), name }));
    } else {
      items = [{ ...newItem(crypto.randomUUID()), name: text }];
    }
    items = items.map((item) => ({ ...item, id: /^[0-9a-f-]{36}$/i.test(item.id) ? item.id : crypto.randomUUID() }));
    edit((list) => appended(list, items));
    setQuick('');
    setAdding(false);
  }

  async function replaceItem(original: GroceryItem, alternative: ShoppingAlternative) {
    let done = false;
    edit((list) => { const next = swapReplacing(original.id, alternative, list); done = next !== null; return next; });
    if (!done) setNotice('That item is no longer on the list.');
    return done;
  }

  async function addAlternative(alternative: ShoppingAlternative) {
    let done = false;
    edit((list) => { const next = swapAdding(alternative, list, crypto.randomUUID()); done = next !== null; return next; });
    if (!done) setNotice('That item is already on the list.');
    return done;
  }

  async function complete() {
    const before = draftRef.current;
    if (!before) return;
    if (!(await flush()) || !baseRef.current) { setConfirm(null); return; }
    const result = await action('complete', baseRef.current, {});
    setConfirm(null);
    if (!result.ok || !result.list) return;
    const summary = completionSummary(before, result.list);
    baseRef.current = result.list.id === before.id ? result.list : baseRef.current;
    setFinished({ summary, next: result.list });
  }

  async function remove() {
    if (!baseRef.current) return;
    dirty.current = false;
    if (timer.current) clearTimeout(timer.current);
    const result = await action('delete', baseRef.current, {});
    setConfirm(null);
    if (result.ok) router.replace('/shopping');
  }

  async function shareAction(operation: 'share' | 'revoke') {
    if (!(await flush()) || !baseRef.current) return;
    const result = await action(operation, baseRef.current, {});
    if (result.ok && result.list) { baseRef.current = result.list; draftRef.current = result.list; setDraft(result.list); }
  }

  async function discard() {
    dirty.current = false;
    setSaveError(null);
    shopping.setError(null);
    await refresh();
  }

  if (!loaded) return <main className="nx-tasks"><p className="nx-status" role="status">Loading list…</p></main>;
  if (!draft) return <main className="nx-tasks"><Link href="/shopping" className="nx-back"><ChevronLeft size={18} aria-hidden="true" /> Shopping</Link><div className="nx-status"><h2>List not found</h2><p>It may have been deleted on another device.</p></div></main>;

  const left = remaining(draft);
  const checked = draft.items.length - left;
  const suggestions = suggestionsFor(quick.trim());

  return <main className="nx-tasks">
    <Link href="/shopping" className="nx-back"><ChevronLeft size={18} aria-hidden="true" /> Shopping</Link>
    <div className="nx-detail-head">
      <h2>{draft.title}</h2>
      <div className="nx-menu">
        <button type="button" className="nx-icon-button" aria-label="List actions" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((open) => !open)}><MoreHorizontal size={22} aria-hidden="true" /></button>
        {menu && <div className="nx-menu-list" role="menu" onClick={() => setMenu(false)}>
          <button type="button" role="menuitem" onClick={() => setSharing(true)}><Share2 size={18} aria-hidden="true" /> Share</button>
          {!readOnly && <button type="button" role="menuitem" onClick={() => setSettings(true)}><Settings2 size={18} aria-hidden="true" /> List settings</button>}
          {!readOnly && draft.items.length > 0 && <button type="button" role="menuitem" onClick={() => edit((list) => setAllChecked(list, left > 0))}><CheckCheck size={18} aria-hidden="true" /> {left > 0 ? 'Check all' : 'Uncheck all'}</button>}
          {!readOnly && <button type="button" role="menuitem" onClick={() => setConfirm('complete')}><Flag size={18} aria-hidden="true" /> Complete shopping</button>}
          <button type="button" role="menuitem" onClick={() => setCopying(draft)}><Copy size={18} aria-hidden="true" /> Copy to new list</button>
          <button type="button" role="menuitem" className="is-danger" onClick={() => setConfirm('delete')}><Trash2 size={18} aria-hidden="true" /> Delete list</button>
        </div>}
      </div>
    </div>
    <p className="nx-count">{shortDay(draft.date)} · {itemCount(draft.items.length)}{draft.weekly && !readOnly ? ' · Repeats weekly' : ''}</p>

    {readOnly && <div className="sp-banner" role="status">This trip is complete, so the list is read-only. <button type="button" onClick={() => setCopying(draft)}><RotateCcw size={14} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> Use this list again</button></div>}

    {draft.items.length > 0 && <div className="sp-progress"><progress max={draft.items.length} value={checked} aria-label="Items checked" /><p>{checked} of {itemCount(draft.items.length)} checked</p></div>}

    {!readOnly && <>
      <form className="sp-add" onSubmit={addTyped}>
        <input aria-label="Add an item" placeholder="Add an item, or several separated by commas" maxLength={400} autoComplete="off" value={quick} disabled={adding} onChange={(event) => setQuick(event.target.value)} />
        <button type="submit" disabled={adding || quick.trim() === ''}>{adding ? 'Adding…' : 'Add'}</button>
      </form>
      {suggestions.length > 0 && <div className="sp-suggest">{suggestions.map((name) => <button key={name} type="button" onClick={() => { edit((list) => appended(list, [{ ...newItem(crypto.randomUUID()), name }])); setQuick(''); }}>{name}</button>)}</div>}
    </>}

    {notice && <p className="nx-notice" role="status">{notice}</p>}
    {saveError && <div className="sp-save-error" role="alert">
      <strong>Your latest changes are not saved.</strong> {shopping.error ?? saveError}
      <div>
        <button type="button" onClick={() => { setSaveError(null); void flush(); }}>Retry save</button>
        <button type="button" onClick={() => void discard()}>Discard local edits and reload</button>
      </div>
    </div>}
    {saving && !saveError && <p className="sp-saving" role="status">Saving…</p>}

    {draft.items.length === 0 && <div className="nx-status"><h2>This list is empty</h2><p>{readOnly ? 'Nothing was on this trip.' : 'Add your first item above.'}</p></div>}

    {groups.map(({ category, items }) => <section key={category} className="sp-group" aria-label={category}>
      <h3>{category}</h3>
      <ul className="sp-items">
        {items.map((item) => <li key={item.id} className={`sp-item ${item.checked ? 'is-checked' : ''}`}>
          <button type="button" className="sp-check" role="checkbox" aria-checked={item.checked} aria-label={`${item.name}, ${item.checked ? 'bought' : 'not bought'}`} disabled={readOnly} onClick={() => edit((list) => toggled(list, item.id))}>
            {item.checked ? <CircleCheck size={26} aria-hidden="true" /> : <Circle size={26} aria-hidden="true" />}
          </button>
          <span className="sp-emoji" aria-hidden="true">{groceryEmoji(item)}</span>
          <button type="button" className="sp-item-open" disabled={readOnly} onClick={() => setEditing(item)}>
            <span className="sp-item-name">{item.name}</span>
            <span className="sp-item-sub">{[amountLabel(item), item.notes].filter(Boolean).join(' · ')}</span>
          </button>
          {!readOnly && supportsFoodAlternatives(item) && <button type="button" className="sp-item-alt" aria-label={`Alternatives for ${item.name}`} onClick={() => setAltFor(item)}><Sparkles size={20} aria-hidden="true" /></button>}
        </li>)}
      </ul>
    </section>)}

    {editing && <ItemEditorSheet item={editing} onClose={() => setEditing(null)} onSave={(item) => { edit((list) => upserted(list, item)); setEditing(null); }} onDelete={() => { edit((list) => removed(list, editing.id)); setEditing(null); }} />}
    {altFor && <AlternativesSheet item={altFor} load={alternatives} onReplace={(alternative) => replaceItem(altFor, alternative)} onAdd={addAlternative} onClose={() => setAltFor(null)} />}
    {sharing && <ShareSheet list={draft} busy={shopping.busy} error={shopping.error} onCreateLink={() => void shareAction('share')} onRevokeLink={() => void shareAction('revoke')} onClose={() => setSharing(false)} />}
    {settings && <ListSettingsSheet list={draft} onClose={() => setSettings(false)} onSave={(values) => { edit((list) => ({ ...list, ...values })); setSettings(false); }} />}
    {confirm === 'complete' && <ConfirmDialog title="Complete shopping?" message={left > 0 ? `${itemCount(left)} still unchecked. ${draft.weekly ? 'Next week’s list will start with every item unchecked.' : 'The list becomes read-only.'}` : draft.weekly ? 'Next week’s list will start with every item unchecked.' : 'The list becomes read-only.'} confirmLabel="Complete" busy={shopping.busy} onConfirm={() => void complete()} onCancel={() => setConfirm(null)} />}
    {confirm === 'delete' && <ConfirmDialog title="Delete this list?" message="This cannot be undone." confirmLabel="Delete" destructive busy={shopping.busy} onConfirm={() => void remove()} onCancel={() => setConfirm(null)} />}
    {finished && <CompletionDialog summary={finished.summary} onDone={() => { setFinished(null); router.replace('/shopping'); }} onOpenNext={finished.next.id !== draft.id ? () => { const next = finished.next.id; setFinished(null); router.replace(`/shopping/${next}`); } : null} onUseAgain={() => { setFinished(null); setCopying(draftRef.current); }} />}
    {copying && <NewListSheet lists={lists} source={copying} busy={shopping.busy} error={shopping.error} onClose={() => setCopying(null)} onCreate={async (input, key) => {
      const result = await action('create', null, input, key);
      if (result.ok && result.list) { setCopying(null); router.push(`/shopping/${result.list.id}`); return result.list; }
      return null;
    }} />}
  </main>;
}
