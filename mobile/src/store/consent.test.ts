import { useConsent } from './consent';

/**
 * Swift keeps consent in memory only (ios/App/NexdoApp.swift:124-125, 720). These tests exist to stop
 * persistence being reintroduced in Phase 6: nothing here may reach AsyncStorage.
 */
describe('consent store', () => {
  beforeEach(() => useConsent.setState({ ai: false, voice: false }));

  it('starts withdrawn, as it does on every Swift launch', () => {
    expect(useConsent.getState()).toMatchObject({ ai: false, voice: false });
  });

  it('sets each flag independently', () => {
    useConsent.getState().setConsent({ ai: true });
    expect(useConsent.getState()).toMatchObject({ ai: true, voice: false });

    useConsent.getState().setConsent({ voice: true });
    expect(useConsent.getState()).toMatchObject({ ai: true, voice: true });
  });

  it('withdraw() clears both flags', () => {
    useConsent.getState().setConsent({ ai: true, voice: true });
    useConsent.getState().withdraw();
    expect(useConsent.getState()).toMatchObject({ ai: false, voice: false });
  });

  it('exposes no persistence surface', () => {
    // `hydrate` was the Phase 2 AsyncStorage entry point; its absence is the regression guard.
    expect(useConsent.getState()).not.toHaveProperty('hydrate');
    expect(useConsent.getState()).not.toHaveProperty('hydrated');
  });
});
