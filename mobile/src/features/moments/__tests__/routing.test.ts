const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));

import { handleNotificationResponse } from '../../../actions/useActionNotifications';
import { DISMISS_ACTION_IDENTIFIER } from '../../../actions/notifications';
import { emailCallbackTicket } from '../device';
import { momentsStore } from '../store';
import { draft, moment, plan, settings } from '../testFixtures';
import { handleMomentNotification, routedDestination } from '../useMomentsLifecycle';

describe('Gmail callback deep link', () => {
  it('returns the ticket only from nexdo://moments-email?status=confirm&ticket=…', () => {
    expect(emailCallbackTicket('nexdo://moments-email?status=confirm&ticket=v1.a.b.c')).toBe('v1.a.b.c');
    expect(emailCallbackTicket('nexdo://moments-email?status=confirm&ticket=v1.a%2Bb')).toBe('v1.a+b');
    expect(emailCallbackTicket('nexdo://moments-email?status=confirm')).toBeNull();
    expect(emailCallbackTicket('nexdo://moments-email?status=connected')).toBeNull();
    expect(emailCallbackTicket('nexdo://moments-email?status=error')).toBeNull();
    expect(emailCallbackTicket('nexdo://moments-email')).toBeNull();
    expect(emailCallbackTicket('nexdo://other?status=confirm&ticket=v1.a')).toBeNull();
    expect(emailCallbackTicket('https://example.com/moments-email?status=confirm&ticket=v1.a')).toBeNull();
  });
});

describe('moment notification routing', () => {
  beforeEach(() => {
    momentsStore.setState({ pendingRoute: null, route: null, owner: null });
  });

  it('records the route for any response but a dismissal', () => {
    expect(handleMomentNotification({ momentID: 'm', momentOwner: 'o' }, DISMISS_ACTION_IDENTIFIER, DISMISS_ACTION_IDENTIFIER)).toBe(false);
    expect(momentsStore.getState().pendingRoute).toBeNull();
    expect(handleMomentNotification({ actionID: 'a', owner: 'o' }, 'default', DISMISS_ACTION_IDENTIFIER)).toBe(false);
    expect(handleMomentNotification({ momentID: 'm', momentOwner: 'o' }, 'default', DISMISS_ACTION_IDENTIFIER)).toBe(true);
    expect(momentsStore.getState().pendingRoute).toEqual({ id: 'm', owner: 'o' });
  });

  it('goes through the Phase 8 notification handler', () => {
    handleNotificationResponse({
      actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
      notification: { request: { content: { data: { momentID: 'plan-9', momentOwner: 'owner' } } } },
    } as never);
    expect(momentsStore.getState().pendingRoute).toEqual({ id: 'plan-9', owner: 'owner' });
  });

  it('opens the editable wish first, then Manage Moment, then Review Wish', () => {
    const withPlan = moment({ id: 'a', drafts: [draft({ plans: [plan({ id: 'sent', status: 'SENT' }), plan({ id: 'live' })] })] });
    expect(routedDestination(withPlan, [withPlan])).toEqual({ pathname: '/wellness/moments/wish', params: { planId: 'live' } });

    const encoded = settings({ groupID: 'g' });
    const one = moment({ id: 'b1', firstName: 'B', festivalSettings: encoded });
    const archived = moment({ id: 'b2', firstName: 'C', festivalSettings: settings({ groupID: 'g', archived: true }) });
    const two = moment({ id: 'b3', firstName: 'D', festivalSettings: encoded });
    expect(routedDestination(one, [one, archived, two])).toEqual({ pathname: '/wellness/moments/manage', params: { ids: 'b1,b3' } });

    const custom = moment({ id: 'c', type: 'custom' });
    expect(routedDestination(custom, [custom])).toEqual({ pathname: '/wellness/moments/review', params: { id: 'c' } });
  });
});
