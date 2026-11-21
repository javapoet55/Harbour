'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Plus, ShoppingCart } from 'lucide-react';
import { itemCount, remaining, shortDay, type GroceryList } from '@/lib/shopping';
import { useShopping } from './use-shopping';
import { NewListSheet } from './shopping-sheets';
import './tasks-screen.css';
import './shopping.css';

function ListCard({ list, onOpen }: { list: GroceryList; onOpen: () => void }) {
  const left = remaining(list);
  return <button type="button" className="sp-list-card" onClick={onOpen}>
    <ShoppingCart size={26} aria-hidden="true" style={{ color: '#3d29f0' }} />
    <span>
      <strong>{list.title}{list.weekly && !list.completedAt && <em className="sp-badge">Weekly</em>}</strong>
      <small>{shortDay(list.date)} · {itemCount(list.items.length)}{list.completedAt ? ' · Completed' : left > 0 ? ` · ${left} to buy` : list.items.length > 0 ? ' · All checked' : ''}</small>
    </span>
    <ChevronRight size={20} aria-hidden="true" />
  </button>;
}

/** The signed-in Shopping page: My Lists, newest first, and New List. */
export function ShoppingScreen() {
  const router = useRouter();
  const shopping = useShopping();
  const { refresh } = shopping;
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const active = useMemo(() => shopping.lists.filter((list) => !list.completedAt), [shopping.lists]);
  const done = useMemo(() => shopping.lists.filter((list) => list.completedAt), [shopping.lists]);

  async function create(input: Parameters<typeof shopping.action>[2], key: string) {
    const result = await shopping.action('create', null, input, key);
    if (result.ok && result.list) {
      setCreating(false);
      router.push(`/shopping/${result.list.id}`);
      return result.list;
    }
    return null;
  }

  return <main className="nx-tasks">
    <div className="nx-header">
      <div><h1>Shopping</h1><p>Lists for your next trip.</p></div>
      <button type="button" className="nx-icon-button" aria-label="New list" onClick={() => { shopping.setError(null); setCreating(true); }}><Plus size={22} aria-hidden="true" /></button>
    </div>

    {!shopping.loaded && <p className="nx-status" role="status">Loading your lists…</p>}
    {shopping.loaded && shopping.loadError && <div className="nx-error" role="alert">{shopping.loadError}<button type="button" onClick={() => void refresh()}>Retry</button></div>}
    {shopping.loaded && !shopping.loadError && shopping.lists.length === 0 && <div className="nx-status">
      <ShoppingCart size={40} aria-hidden="true" />
      <h2>No lists yet</h2>
      <p>Create a list and check items off at the store.</p>
      <button type="button" className="nx-outline-button" onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" /> New List</button>
    </div>}

    {active.length > 0 && <>
      <h2 className="sp-heading">MY LISTS</h2>
      <div className="sp-lists">{active.map((list) => <ListCard key={list.id} list={list} onOpen={() => router.push(`/shopping/${list.id}`)} />)}</div>
    </>}
    {done.length > 0 && <>
      <h2 className="sp-heading">COMPLETED</h2>
      <div className="sp-lists">{done.map((list) => <ListCard key={list.id} list={list} onOpen={() => router.push(`/shopping/${list.id}`)} />)}</div>
    </>}

    {creating && <NewListSheet lists={shopping.lists} source={null} busy={shopping.busy} error={shopping.error} onCreate={create} onClose={() => setCreating(false)} />}
  </main>;
}
