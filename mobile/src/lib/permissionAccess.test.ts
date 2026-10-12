import { authorizeMicrophone, MicrophoneDenied, MICROPHONE_DENIED, PermissionCancelled, permissionDecision, statusFromExpo, type PermissionResource, type PermissionStatus } from './permissionAccess';

/** The cases are Swift's own: ios/Tests/NexdoCoreTests/PermissionAccessTests.swift (b61801c). */

const RESOURCES: PermissionResource[] = ['calendar', 'contacts', 'notifications'];

describe('PermissionAccess', () => {
  it('requests only undecided access', () => {
    for (const resource of RESOURCES) {
      expect(permissionDecision(resource, 'notDetermined')).toBe('request');
      expect(permissionDecision(resource, 'authorized')).toBe('allow');
      expect(permissionDecision(resource, 'denied')).toBe('deny');
      expect(permissionDecision(resource, 'restricted')).toBe('deny');
    }
  });

  it('lets limited contacts through, and nothing else', () => {
    expect(permissionDecision('contacts', 'limited')).toBe('allow');
    expect(permissionDecision('calendar', 'limited')).toBe('deny');
    expect(permissionDecision('notifications', 'limited')).toBe('deny');
  });

  it.each<PermissionStatus>(['provisional', 'ephemeral'])('uses %s notifications without another prompt', (status) => {
    expect(permissionDecision('notifications', status)).toBe('allow');
    expect(permissionDecision('contacts', status)).toBe('deny');
    expect(permissionDecision('calendar', status)).toBe('deny');
  });

  it('asks again to upgrade a write-only calendar before reading it', () => {
    expect(permissionDecision('calendar', 'writeOnly')).toBe('request');
    expect(permissionDecision('contacts', 'writeOnly')).toBe('deny');
  });

  it('reads Expo answers the way the notification helper does', () => {
    expect(statusFromExpo({ status: 'granted', canAskAgain: true })).toBe('authorized');
    expect(statusFromExpo({ status: 'granted', canAskAgain: true, accessPrivileges: 'limited' })).toBe('limited');
    expect(statusFromExpo({ status: 'undetermined', canAskAgain: true })).toBe('notDetermined');
    expect(statusFromExpo({ status: 'denied', canAskAgain: true })).toBe('notDetermined');
    expect(statusFromExpo({ status: 'denied', canAskAgain: false })).toBe('denied');
  });
});

describe('VoicePermissionGate', () => {
  // deniedMicrophoneStopsSessionCreationAndAllowsRetry
  it('stops on a denial, and the same flow works once access is on', async () => {
    let sessions = 0;
    const start = async (allowed: boolean) => {
      await authorizeMicrophone(async () => allowed, () => false);
      sessions += 1;
    };
    await expect(start(false)).rejects.toBeInstanceOf(MicrophoneDenied);
    expect(sessions).toBe(0);
    await start(true);
    expect(sessions).toBe(1);
    expect(new MicrophoneDenied().message).toBe(MICROPHONE_DENIED);
  });

  // cancellingMicrophonePromptStopsSessionCreation
  it('stops when the screen closes while the prompt is up', async () => {
    let closed = false;
    const sessions: number[] = [];
    await expect(
      authorizeMicrophone(
        async () => {
          closed = true;
          return true;
        },
        () => closed,
      ).then(() => sessions.push(1)),
    ).rejects.toBeInstanceOf(PermissionCancelled);
    expect(sessions).toEqual([]);
  });
});

describe('decisionFromExpo (Phase 13 Calendar run)', () => {
  const { decisionFromExpo } = require('./permissionAccess') as typeof import('./permissionAccess');
  it('maps an Expo answer straight to a decision', () => {
    expect(decisionFromExpo('calendar', { status: 'granted', canAskAgain: true })).toBe('allow');
    expect(decisionFromExpo('calendar', { status: 'undetermined', canAskAgain: true })).toBe('request');
    // Android: asked once and refused, but may ask again — still a request, not a block.
    expect(decisionFromExpo('calendar', { status: 'denied', canAskAgain: true })).toBe('request');
    expect(decisionFromExpo('calendar', { status: 'denied', canAskAgain: false })).toBe('deny');
    // iOS 18 limited contacts are usable; a limited calendar grant would not be.
    expect(decisionFromExpo('contacts', { status: 'granted', canAskAgain: true, accessPrivileges: 'limited' })).toBe('allow');
    expect(decisionFromExpo('calendar', { status: 'granted', canAskAgain: true, accessPrivileges: 'limited' })).toBe('deny');
  });
});
