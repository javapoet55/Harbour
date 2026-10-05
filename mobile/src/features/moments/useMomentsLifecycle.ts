import { router } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import type { ImportantMoment } from '../../api/moments';
import { editableGroups, planEditable, supportsGreetingCard } from './domain';
import { readMomentPayload } from './notifications';
import { momentsStore, useMoments } from './store';

/**
 * `RootView`'s Moments wiring (ios/App/RootView.swift:57-72, :81):
 *
 * - `moments.activate(id)` whenever the signed-in profile changes, which clears the old account's
 *   snapshot and reminders and loads the new one;
 * - `moments.refresh()` whenever the app becomes active;
 * - `MomentSheetHost`: a resolved notification route opens Important Moments with the moment's detail
 *   pushed on top (`MomentRoutedView`, ImportantMomentsView.swift:563-594).
 */
export function useMomentsLifecycle(profileId: string | null | undefined): void {
  useEffect(() => {
    void momentsStore.getState().activate(profileId ?? null);
  }, [profileId]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && momentsStore.getState().owner) void momentsStore.getState().refresh();
    });
    return () => subscription.remove();
  }, []);

  // `MomentSheetHost` (ImportantMomentsView.swift:595-609): the moment's detail over Important Moments,
  // opening the very wish that was tapped (`planID`) …
  const route = useMoments((state) => state.route);
  useEffect(() => {
    if (!route) return;
    const plan = momentsStore.getState().routedPlanID;
    momentsStore.getState().clearRoute();
    router.push({ pathname: '/wellness/moments', params: { routed: route.id, ...(plan ? { plan } : {}) } });
  }, [route]);

  // … or, when the tapped moment is gone, Important Moments on its own (`showingNotificationInbox`).
  const inbox = useMoments((state) => state.showingInbox);
  useEffect(() => {
    if (!inbox) return;
    momentsStore.getState().clearInbox();
    router.push({ pathname: '/wellness/moments', params: { routed: INBOX } });
  }, [inbox]);
}

/**
 * `didReceive response` for a Moments reminder (TaskActionNotifications.swift:68-70): anything but a
 * dismissal records the route, and `RootView` refreshes and resolves it (`:71`).
 */
export function handleMomentNotification(data: unknown, actionIdentifier: string, dismissIdentifier: string): boolean {
  const payload = readMomentPayload(data);
  if (!payload || actionIdentifier === dismissIdentifier) return false;
  momentsStore.getState().receiveRoute(payload.momentID, payload.momentOwner);
  void momentsStore
    .getState()
    .refresh()
    .then(() => momentsStore.getState().resolveRoute());
  return true;
}

/** The `routed` value that opens Important Moments with Close and no detail (the notification inbox). */
export const INBOX = 'inbox';

/**
 * `MomentRoutedView`'s destination (ImportantMomentsView.swift:612-632): the wish that was tapped
 * (`planID`, Phase 12), else the moment's editable wish, else its Manage Moment for a greeting-card
 * occasion, else Review Wish.
 */
export function routedDestination(moment: ImportantMoment, moments: ImportantMoment[], planID?: string | null): { pathname: string; params: Record<string, string> } {
  const plans = moment.drafts.flatMap((draft) => draft.plans ?? []);
  const plan = plans.find((item) => item.id === planID) ?? plans.find(planEditable);
  if (plan) return { pathname: '/wellness/moments/wish', params: { planId: plan.id } };
  if (supportsGreetingCard(moment)) {
    const group = editableGroups(moments.filter((item) => item.type === moment.type)).find((entry) => entry.moments.some((item) => item.id === moment.id));
    if (group) return { pathname: '/wellness/moments/manage', params: { ids: group.moments.map((item) => item.id).join(',') } };
  }
  return { pathname: '/wellness/moments/review', params: { id: moment.id } };
}
