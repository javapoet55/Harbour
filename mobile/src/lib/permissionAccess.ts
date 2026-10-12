/**
 * `PermissionAccess` and `VoicePermissionGate` (b61801c, ios/Sources/NexdoCore/PermissionAccess.swift):
 * one decision table for calendar, contacts and notifications, which the platform adapters feed with
 * the OS status. Swift uses it in AppleCalendarService, TaskActionContacts and TaskActionNotifications.
 *
 * On Android, Expo reports `granted` / `denied` / `undetermined` with `canAskAgain`; the adapter maps
 * that the way `classifyNotificationPermission` (notificationPermission.ts) already does — "never
 * asked" and "asked, said no but can ask again" are `notDetermined`, "blocked" is `denied`.
 */

export type PermissionStatus = 'notDetermined' | 'denied' | 'restricted' | 'authorized' | 'limited' | 'provisional' | 'ephemeral' | 'writeOnly';
export type PermissionResource = 'calendar' | 'contacts' | 'notifications';
export type PermissionDecision = 'request' | 'allow' | 'deny';

/** `decision(for:status:)` (:8-19). */
export function permissionDecision(resource: PermissionResource, status: PermissionStatus): PermissionDecision {
  switch (status) {
    case 'notDetermined':
      return 'request';
    case 'authorized':
      return 'allow';
    // Limited contacts are usable; a limited calendar or notification grant is not.
    case 'limited':
      return resource === 'contacts' ? 'allow' : 'deny';
    // Quiet notifications deliver without another prompt.
    case 'provisional':
    case 'ephemeral':
      return resource === 'notifications' ? 'allow' : 'deny';
    // Calendar needs read access to display events; write-only can be upgraded by asking again.
    case 'writeOnly':
      return resource === 'calendar' ? 'request' : 'deny';
    case 'denied':
    case 'restricted':
      return 'deny';
  }
}

/** Expo's permission answer, the shape every `expo-*` `getPermissionsAsync` returns. */
export type ExpoPermission = { status: 'granted' | 'denied' | 'undetermined'; canAskAgain: boolean; accessPrivileges?: 'all' | 'limited' | 'none' };

/**
 * An Expo answer as a `PermissionStatus`. `accessPrivileges: 'limited'` is the iOS 18 contacts grant
 * (expo-contacts); Android has no limited, provisional or write-only state.
 */
export function statusFromExpo(permission: ExpoPermission): PermissionStatus {
  if (permission.status === 'granted') return permission.accessPrivileges === 'limited' ? 'limited' : 'authorized';
  if (permission.status === 'undetermined') return 'notDetermined';
  return permission.canAskAgain ? 'notDetermined' : 'denied';
}

/**
 * `decision(for:status:)` straight from an Expo answer — the adapter the Swift call sites compose by hand
 * (`AppleCalendarService.requestAccess`, `AppleTaskActionContacts`, `LocalTaskActionScheduler`).
 *
 * Which Android permission each resource is (Phase 13 Calendar run, android-polish.md §37):
 * - `calendar`: `READ_CALENDAR` through expo-calendar (`getCalendarPermissionsAsync`); the app blocks
 *   `WRITE_CALENDAR`, so there is no write-only state to upgrade from — `writeOnly` never occurs.
 * - `contacts`: `READ_CONTACTS` through expo-contacts; Android has no limited grant, so `limited` is iOS 18 only.
 * - `notifications`: `POST_NOTIFICATIONS` through expo-notifications; the Android quirk ("denied" until
 *   granted, `canAskAgain` deciding) is folded in by `classifyNotificationPermission`, which keeps its own
 *   richer table — `provisional` / `ephemeral` are iOS only.
 * - the microphone (`RECORD_AUDIO`, expo-audio) is not a `PermissionResource`: `authorizeMicrophone` below
 *   is Swift's separate `VoicePermissionGate`, which only needs the boolean.
 */
export function decisionFromExpo(resource: PermissionResource, permission: ExpoPermission): PermissionDecision {
  return permissionDecision(resource, statusFromExpo(permission));
}

/** `VoicePermissionGate.Failure.microphoneDenied` (:26-31). Voice shows it with an "Open Settings" button. */
export const MICROPHONE_DENIED = 'Microphone access is off. Enable it in Settings to use voice, or close this screen to type.';

export class MicrophoneDenied extends Error {
  constructor() {
    super(MICROPHONE_DENIED);
    Object.setPrototypeOf(this, MicrophoneDenied.prototype);
    this.name = 'MicrophoneDenied';
  }
}

/** The screen closed while the system prompt was up (Swift's `CancellationError`): not an error to show. */
export class PermissionCancelled extends Error {
  constructor() {
    super('Permission request cancelled.');
    Object.setPrototypeOf(this, PermissionCancelled.prototype);
    this.name = 'PermissionCancelled';
  }
}

/**
 * `VoicePermissionGate.authorize` (:33-38): ask for the microphone BEFORE a voice session is created,
 * and stop if the screen went away while the prompt was open. A denial throws `MicrophoneDenied`; the
 * same flow works again once access is turned on.
 */
export async function authorizeMicrophone(request: () => Promise<boolean>, cancelled: () => boolean): Promise<void> {
  if (cancelled()) throw new PermissionCancelled();
  const allowed = await request();
  if (cancelled()) throw new PermissionCancelled();
  if (!allowed) throw new MicrophoneDenied();
}
