import type { WishDeliveryPlan, WishDraft } from '../../api/moments';
import { allPlans } from './domain';
import { momentsStore } from './store';

/**
 * Swift pushes the NEXT screen with the value it just received — `WishDeliveryView(moment:draft:)`,
 * `WishPlanView(plan:)`. A route can only carry strings, so the value is parked here under its id and
 * read back; the snapshot is the fallback and, once refreshed, the authority (`current` in
 * `WishPlanView`, ImportantMomentsView.swift:505).
 */
const drafts = new Map<string, WishDraft>();
const plans = new Map<string, WishDeliveryPlan>();

export function rememberDraft(draft: WishDraft): void {
  drafts.set(draft.id, draft);
}

export function rememberPlan(plan: WishDeliveryPlan): void {
  plans.set(plan.id, plan);
}

export function findDraft(id: string | undefined): WishDraft | undefined {
  if (!id) return undefined;
  const fromStore = momentsStore
    .getState()
    .snapshot?.moments.flatMap((moment) => moment.drafts)
    .find((draft) => draft.id === id);
  return drafts.get(id) ?? fromStore;
}

/** The latest known state of a plan: the snapshot's copy when it has one. */
export function findPlan(id: string | undefined): WishDeliveryPlan | undefined {
  if (!id) return undefined;
  const fromStore = (momentsStore.getState().snapshot?.moments ?? []).flatMap(allPlans).find((plan) => plan.id === id);
  return fromStore ?? plans.get(id);
}
