import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { permissionDecision, type PermissionDecision } from '../../lib/permissionAccess';
import { deviceCalendarAccess } from './deviceCalendars';

/**
 * `EKEventStore.authorizationStatus(for: .event) == .fullAccess`, read on appear and again whenever the
 * scene turns active (CalendarConnectionView.swift:8, :61-67, :96, :178-180; ProfileView.swift). The hub,
 * the provider page and Settings all re-read it this way after the user comes back from Settings.
 *
 * `decision` is `null` until the first read lands; `allowed` is the `.allow` decision and `denied` the
 * `.deny` one (denied or restricted — the states that offer **Open Settings**).
 */
export function useDeviceCalendarAccess(): { decision: PermissionDecision | null; allowed: boolean; denied: boolean; refresh: () => Promise<PermissionDecision> } {
  const [decision, setDecision] = useState<PermissionDecision | null>(null);

  const refresh = useCallback(async () => {
    let next: PermissionDecision = 'deny';
    try {
      next = permissionDecision('calendar', await deviceCalendarAccess());
    } catch {
      // A phone without a calendar provider: the permission module throws, and access reads denied.
    }
    setDecision(next);
    return next;
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  return { decision, allowed: decision === 'allow', denied: decision === 'deny', refresh };
}
