import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { GroceryItem, GroceryList, ShoppingAlternative, ShoppingAlternativesResponse } from '../../api/shopping';
import { addedAlternative, alternativeId, replacedWithAlternative } from './model';
import { shoppingStore } from './store';

/**
 * The state of `ShoppingAlternativesView` (ios/App/ShoppingViews.swift:417-609) without the sheet:
 * load once on appear, preselect the first alternative, and apply the selection the way
 * `ShoppingDetail.replace(_:with:)` / `add(_:)` do (`:344-352`), through the screen's own `save`.
 *
 * `replace()` and `addInstead()` return true when there was a selection (the sheet then dismisses, as
 * Swift's buttons do), false when there was none.
 */
export type UseShoppingAlternatives = {
  result: ShoppingAlternativesResponse | null;
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  selected: ShoppingAlternative | null;
  select: (id: string) => void;
  load: () => Promise<void>;
  replace: () => boolean;
  addInstead: () => boolean;
};

export function useShoppingAlternatives({
  list,
  original,
  save,
  fetchAlternatives = (item) => shoppingStore.getState().alternatives(item),
  uuid = () => Crypto.randomUUID().toUpperCase(),
}: {
  list: GroceryList;
  original: GroceryItem;
  save: (next: GroceryList) => void | Promise<void>;
  fetchAlternatives?: (item: GroceryItem) => Promise<ShoppingAlternativesResponse>;
  uuid?: () => string;
}): UseShoppingAlternatives {
  const [result, setResult] = useState<ShoppingAlternativesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetcher = useRef(fetchAlternatives);
  useEffect(() => {
    fetcher.current = fetchAlternatives;
  });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** `load()` (ShoppingViews.swift:601-608). Only a lost session reaches the catch. */
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetcher.current(original);
      if (!mounted.current) return;
      setResult(response);
      setSelectedId(response.alternatives[0] ? alternativeId(response.alternatives[0]) : null);
    } catch (caught) {
      if (!mounted.current) return;
      setError(caught instanceof Error ? caught.message : String(caught));
    }
    if (mounted.current) setLoading(false);
  }, [original]);

  // `.task{if result==nil{await load()}}` (:462).
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void load();
  }, [load]);

  const selected = result?.alternatives.find((alternative) => alternativeId(alternative) === selectedId) ?? null;

  return {
    result,
    loading,
    error,
    selectedId,
    selected,
    select: setSelectedId,
    load,
    replace: () => {
      if (!selected) return false;
      const next = replacedWithAlternative(list, original.id, selected);
      if (next) void save(next);
      return true;
    },
    addInstead: () => {
      if (!selected) return false;
      void save(addedAlternative(list, selected, uuid()));
      return true;
    },
  };
}
