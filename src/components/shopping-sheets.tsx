'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, Copy, Link2, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import {
  CATEGORIES, copiedItems, isOriginalItem, itemCount, listInput, previousList, shareText, shareUrl,
  type CompletionSummary, type GroceryItem, type GroceryList, type ShoppingAlternative, type ShoppingAlternativesResponse, type ShoppingInput,
} from '@/lib/shopping';
import './tasks-screen.css';
import './shopping.css';

/** A modal sheet in the style of the Tasks sheets. Closing it (Close, Escape) is blocked while it is busy. */
export function Sheet({ title, onClose, busy = false, onSubmit, footer, children }: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    return () => { element?.close(); opener?.focus(); };
  }, []);
  return <dialog ref={dialog} className="nx-sheet" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={onSubmit ?? ((event) => event.preventDefault())} aria-busy={busy}>
      <header className="nx-sheet-head">
        <button type="button" className="nx-pill-button" disabled={busy} onClick={onClose}>Close</button>
        <h2 id={titleId}>{title}</h2>
        <span />
      </header>
      <div className="nx-sheet-body">{children}</div>
      {footer && <footer className="nx-sheet-foot">{footer}</footer>}
    </form>
  </dialog>;
}

/** A short question with two answers, for Complete Shopping and Delete list. */
export function ConfirmDialog({ title, message, confirmLabel, destructive = false, busy = false, onConfirm, onCancel }: {
  title: string;
  message?: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    return () => { element?.close(); opener?.focus(); };
  }, []);
  return <dialog ref={dialog} className="nx-sheet nx-confirm sp-confirm" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id={titleId}>{title}</h2>
    {message && <p>{message}</p>}
    <div className="sp-confirm-actions">
      <button type="button" className="nx-secondary" disabled={busy} onClick={onCancel}>Cancel</button>
      <button type="button" className={`nx-primary ${destructive ? 'nx-danger' : ''}`} disabled={busy} onClick={onConfirm}>{confirmLabel}</button>
    </div>
  </dialog>;
}

const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const dayIn = (zone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/**
 * New List: a blank list, or a copy of last week's (or of the list being copied) with every item unchecked.
 * One key per open sheet, so a retry after a dropped answer replays the same write and cannot make two lists.
 */
export function NewListSheet({ lists, source, busy, error, onCreate, onClose }: {
  lists: GroceryList[];
  source: GroceryList | null;
  busy: boolean;
  error: string | null;
  onCreate: (input: ShoppingInput, key: string) => Promise<GroceryList | null>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(source?.title ?? 'Shopping List');
  const [zone] = useState(deviceZone);
  const [date, setDate] = useState(() => dayIn(deviceZone()));
  const [weekly, setWeekly] = useState(true);
  const [useLast, setUseLast] = useState(source !== null);
  const key = useRef('');
  const previous = previousList(lists, source);
  const canCreate = !busy && title.trim() !== '' && date !== '';

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;
    key.current ||= crypto.randomUUID();
    const value: GroceryList = {
      id: crypto.randomUUID(), title: title.trim(), date, timeZone: zone, weekly, revision: 0,
      items: useLast ? copiedItems(previous, () => crypto.randomUUID()) : [],
    };
    const created = await onCreate(listInput(value), key.current);
    if (created) key.current = '';
  }

  return <Sheet title="New List" onClose={onClose} busy={busy} onSubmit={create} footer={<button type="submit" className="nx-primary" disabled={!canCreate}>{busy ? 'Creating…' : 'Create List'}</button>}>
    <div className="sp-choices" role="group" aria-label="Start from">
      <button type="button" aria-pressed={!useLast} onClick={() => setUseLast(false)}><strong>Start from Scratch</strong><small>Create a brand new list.</small></button>
      <button type="button" aria-pressed={useLast} disabled={!previous} onClick={() => setUseLast(true)}>
        <strong>Use Last Week’s List</strong>
        <small>{previous ? `Copy ${itemCount(previous.items.length)} from “${previous.title}” and edit.` : 'Create your first list to reuse it next time.'}</small>
      </button>
    </div>
    <div className="nx-form-card" style={{ marginTop: 14 }}>
      <div>
        <label className="nx-label" htmlFor="sp-new-name">LIST NAME</label>
        <input id="sp-new-name" className="nx-field" required maxLength={100} autoComplete="off" value={title} disabled={busy} onChange={(event) => setTitle(event.target.value)} />
      </div>
      <hr />
      <div>
        <label className="nx-label" htmlFor="sp-new-date">SHOPPING DATE</label>
        <input id="sp-new-date" type="date" className="nx-field" required value={date} disabled={busy} onChange={(event) => setDate(event.target.value)} />
      </div>
      <hr />
      <label className="nx-form-row"><span>Repeat every week</span><input type="checkbox" checked={weekly} disabled={busy} onChange={(event) => setWeekly(event.target.checked)} /></label>
      <p className="nx-hint">Complete a trip to copy all items into next week’s list, with every item unchecked.</p>
    </div>
    {error && <p role="alert" className="nx-sheet-error">{error}</p>}
  </Sheet>;
}

/** Edit an item already on the list: name, category, amount and notes, or remove it. */
export function ItemEditorSheet({ item, onSave, onDelete, onClose }: {
  item: GroceryItem;
  onSave: (item: GroceryItem) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(item.category);
  const [quantity, setQuantity] = useState(item.quantity);
  const [size, setSize] = useState(item.size);
  const [notes, setNotes] = useState(item.notes);
  const canSave = name.trim() !== '';

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    onSave({ ...item, name: name.trim(), category, quantity: quantity.trim() || '1', size: size.trim(), notes: notes.trim() });
  }

  return <Sheet title="Edit Item" onClose={onClose} onSubmit={submit} footer={<>
    <button type="button" className="nx-secondary" onClick={onDelete}><Trash2 size={18} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 6 }} />Delete</button>
    <button type="submit" className="nx-primary" disabled={!canSave}>Save</button>
  </>}>
    <div className="nx-form-card">
      <div>
        <label className="nx-label" htmlFor="sp-item-name">ITEM</label>
        <input id="sp-item-name" className="nx-field" required maxLength={120} autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <hr />
      <div>
        <label className="nx-label" htmlFor="sp-item-category">CATEGORY</label>
        <select id="sp-item-category" className="nx-field" value={category} onChange={(event) => setCategory(event.target.value)}>
          {[...CATEGORIES, ...(CATEGORIES.some((value) => value === category) ? [] : [category])].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>
      <hr />
      <div className="sp-two">
        <div>
          <label className="nx-label" htmlFor="sp-item-quantity">QUANTITY</label>
          <input id="sp-item-quantity" className="nx-field" maxLength={40} autoComplete="off" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        </div>
        <div>
          <label className="nx-label" htmlFor="sp-item-size">SIZE</label>
          <input id="sp-item-size" className="nx-field" maxLength={80} autoComplete="off" placeholder="1 gallon, 12 oz…" value={size} onChange={(event) => setSize(event.target.value)} />
        </div>
      </div>
      <hr />
      <div>
        <label className="nx-label" htmlFor="sp-item-notes">NOTES</label>
        <textarea id="sp-item-notes" className="nx-field" rows={3} maxLength={300} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </div>
    </div>
  </Sheet>;
}

const altKey = (alternative: ShoppingAlternative) => [alternative.name, alternative.category, alternative.quantity, alternative.size].join('|');

function factsLine(alternative: ShoppingAlternative) {
  const nutrition = alternative.facts?.nutrition;
  if (!nutrition) return '';
  const parts = [
    nutrition.calories != null ? `${nutrition.calories} kcal` : '',
    nutrition.protein != null ? `${nutrition.protein} g protein` : '',
    nutrition.sugar != null ? `${nutrition.sugar} g sugar` : '',
    nutrition.totalFat != null ? `${nutrition.totalFat} g fat` : '',
  ].filter(Boolean);
  return parts.length ? `${parts.join(' · ')}${nutrition.servingSize ? ` per ${nutrition.servingSize}` : ''}` : '';
}

/**
 * Alternatives for one item. "Replace" swaps the item in place (it keeps its quantity, size, notes and
 * checked state); "Add to list" adds the alternative as a new item.
 */
export function AlternativesSheet({ item, load, onReplace, onAdd, onClose }: {
  item: GroceryItem;
  load: (item: GroceryItem) => Promise<ShoppingAlternativesResponse>;
  onReplace: (alternative: ShoppingAlternative) => Promise<boolean>;
  onAdd: (alternative: ShoppingAlternative) => Promise<boolean>;
  onClose: () => void;
}) {
  const [data, setData] = useState<ShoppingAlternativesResponse | null>(null);
  const [failed, setFailed] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [added, setAdded] = useState<string[]>([]);
  const [working, setWorking] = useState('');

  useEffect(() => {
    let cancelled = false;
    load(item).then(
      (response) => { if (!cancelled) setData(response); },
      (reason) => { if (!cancelled) setFailed(reason instanceof Error ? reason.message : 'Alternatives could not be loaded.'); },
    );
    return () => { cancelled = true; };
  }, [item, load, attempt]);

  function retry() { setData(null); setFailed(''); setAttempt((value) => value + 1); }

  async function replace(alternative: ShoppingAlternative) {
    setWorking(altKey(alternative));
    const ok = await onReplace(alternative);
    setWorking('');
    if (ok) onClose();
  }

  async function add(alternative: ShoppingAlternative) {
    setWorking(altKey(alternative));
    const ok = await onAdd(alternative);
    setWorking('');
    if (ok) setAdded((current) => [...current, altKey(alternative)]);
  }

  const options = (data?.alternatives ?? []).filter((alternative) => !isOriginalItem(alternative, item));

  return <Sheet title="Alternatives" onClose={onClose} busy={working !== ''}>
    <p className="sp-alt-for"><Sparkles size={16} aria-hidden="true" /> Swaps for <strong>{item.name}</strong></p>
    {!data && !failed && <p className="sp-muted" role="status">Finding alternatives…</p>}
    {failed && <div role="alert"><p className="nx-sheet-error">{failed}</p><button type="button" className="nx-secondary" onClick={retry}><RefreshCw size={16} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 6 }} />Try again</button></div>}
    {data && options.length === 0 && <p className="sp-muted">No other options were found for this item.</p>}
    {options.length > 0 && <ul className="sp-alts">
      {options.map((alternative) => {
        const key = altKey(alternative);
        const done = added.includes(key);
        const line = factsLine(alternative);
        return <li key={key}>
          <strong>{alternative.name}{alternative.size ? <span> · {alternative.size}</span> : null}</strong>
          <p>{alternative.reason}</p>
          {alternative.detail && <p className="sp-muted">{alternative.detail}</p>}
          {line && <p className="sp-facts">{line}</p>}
          <div className="sp-alt-actions">
            <button type="button" className="sp-chip-action" disabled={working !== ''} onClick={() => void replace(alternative)}>Replace</button>
            <button type="button" className="sp-chip-action" disabled={working !== '' || done} onClick={() => void add(alternative)}>{done ? <><Check size={15} aria-hidden="true" /> Added</> : 'Add to list'}</button>
          </div>
        </li>;
      })}
    </ul>}
    {data?.tip && <p className="sp-tip">{data.tip}</p>}
    <p className="nx-hint" style={{ marginTop: 12 }}>Compare the package label, ingredients, size and price before choosing.</p>
  </Sheet>;
}

/** Share a list: copy it as text, or make a view-only link that can be revoked at any time. */
export function ShareSheet({ list, busy, error, onCreateLink, onRevokeLink, onClose }: {
  list: GroceryList;
  busy: boolean;
  error: string | null;
  onCreateLink: () => void;
  onRevokeLink: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState('');
  const url = list.shareToken ? shareUrl(window.location.origin, list.shareToken) : null;

  const copy = useCallback(async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
    } catch {
      setCopied('');
    }
  }, []);

  return <Sheet title="Share List" onClose={onClose} busy={busy}>
    <div className="nx-form-card">
      <p className="nx-label">SHARE AS TEXT</p>
      <button type="button" className="nx-secondary sp-wide" onClick={() => void copy('text', shareText(list))}><Copy size={17} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 8 }} />{copied === 'text' ? 'Copied' : 'Copy list as text'}</button>
      <hr />
      <p className="nx-label">VIEW-ONLY LINK</p>
      <p className="nx-hint">Anyone with the link can view this list’s checked items. The link stays with this trip; next week’s list needs a new link. Revoke it whenever you like.</p>
      {url ? <>
        <input className="nx-field" readOnly aria-label="View-only link" value={url} onFocus={(event) => event.currentTarget.select()} />
        <div className="sp-link-actions">
          <button type="button" className="nx-secondary" onClick={() => void copy('link', url)}><Link2 size={17} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 8 }} />{copied === 'link' ? 'Copied' : 'Copy link'}</button>
          <button type="button" className="nx-secondary sp-revoke" disabled={busy} onClick={onRevokeLink}>Revoke link</button>
        </div>
      </> : <button type="button" className="nx-primary sp-wide" disabled={busy} onClick={onCreateLink}>{busy ? 'Creating…' : 'Create share link'}</button>}
    </div>
    {error && <p role="alert" className="nx-sheet-error">{error}</p>}
  </Sheet>;
}

/** Shown after Complete Shopping. */
export function CompletionDialog({ summary, onDone, onOpenNext, onUseAgain }: {
  summary: CompletionSummary;
  onDone: () => void;
  onOpenNext: (() => void) | null;
  onUseAgain: () => void;
}) {
  return <ConfirmDialog
    title="Trip complete 🎉"
    message={`${summary.listName}: ${summary.purchased} of ${itemCount(summary.total).replace(/^1 item$/, '1 item')} purchased${summary.remaining > 0 ? `, ${summary.remaining} left unchecked in your history` : ''}.${summary.nextListReady ? ' Next week’s list is ready, with every item unchecked.' : ''}`}
    confirmLabel={onOpenNext ? 'Open next week’s list' : 'Use this list again'}
    onConfirm={onOpenNext ?? onUseAgain}
    onCancel={onDone}
  />;
}
