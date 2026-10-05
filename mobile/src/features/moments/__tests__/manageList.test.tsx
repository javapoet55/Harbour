import { fireEvent, render, screen, within } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock('../../../api/moments', () => ({
  ...jest.requireActual('../../../api/moments'),
  momentsApi: { snapshot: jest.fn(), post: jest.fn(), deleteAll: jest.fn() },
}));

import type { ImportantMoment } from '../../../api/moments';
import { displayGroups, managementDateLabels, managementFilterIncludes, managementGroups } from '../domain';
import { momentsStore } from '../store';
import { draft, moment, plan, settings } from '../testFixtures';

import ManageMoments from '../../../../app/wellness/moments/manage-list';

/** `MomentsManagementEntry` and `MomentManagementFilter` (ManageFestivalView.swift:4-88, ImportantMoment.swift:198-210). */

const approved = settings({ groupID: 'g', baseMessage: 'Happy day!', approvedAt: '2030-01-01T00:00:00Z' });
/** A birthday whose wish is scheduled on the day. */
const scheduled = (id: string, day: string, extra: Partial<ImportantMoment> = {}) =>
  moment({ id, title: `${id} birthday`, firstName: id, occurrenceDate: day, nextOccurrence: day, festivalSettings: settings({ groupID: id }), drafts: [draft({ id: `d${id}`, momentID: id, plans: [plan({ id: `p${id}`, draftID: `d${id}`, scheduledAtUTC: `${day}T09:00:00.000Z` })] })], ...extra });

function load(moments: ImportantMoment[]) {
  momentsStore.setState({ snapshot: { moments, emailAccount: null, emailConfigured: false, automaticEmailEnabled: false }, owner: 'owner' });
}

beforeEach(() => jest.clearAllMocks());

describe('MomentManagementFilter', () => {
  it('puts a scheduled group under Scheduled only', () => {
    const [group] = displayGroups([scheduled('s', '2030-09-20')]);
    expect(managementFilterIncludes('Scheduled', group)).toBe(true);
    expect(managementFilterIncludes('Ready to Schedule', group)).toBe(false);
    expect(managementFilterIncludes('Need Review', group)).toBe(false);
  });

  it('puts an approved, unscheduled wish under Ready to Schedule, and an inactive one under Need Review', () => {
    const [ready] = displayGroups([moment({ id: 'r', festivalSettings: approved })]);
    expect(managementFilterIncludes('Ready to Schedule', ready)).toBe(true);
    expect(managementFilterIncludes('Scheduled', ready)).toBe(false);
    const [inactive] = displayGroups([moment({ id: 'i', enabled: false })]);
    expect(managementFilterIncludes('Need Review', inactive)).toBe(true);
  });

  it('lets a group with recipients at different stages show under each', () => {
    const settingsJSON = settings({ groupID: 'mix' });
    const [group] = displayGroups([
      scheduled('a', '2030-09-20', { festivalSettings: settingsJSON }),
      moment({ id: 'b', firstName: 'b', occurrenceDate: '2030-09-20', nextOccurrence: '2030-09-20', festivalSettings: settingsJSON }),
    ]);
    expect(managementFilterIncludes('Scheduled', group)).toBe(true);
    expect(managementFilterIncludes('Need Review', group)).toBe(true);
  });

  it('sorts the latest send or occasion first and labels each recipient’s date once', () => {
    const groups = managementGroups([scheduled('early', '2030-03-01'), scheduled('late', '2030-11-01')]);
    expect(groups.map((group) => group.moments[0].id)).toEqual(['late', 'early']);
    expect(managementDateLabels(groups[0])).toEqual(['Scheduled: Fri, Nov 1, 2030']);
    expect(managementDateLabels(displayGroups([moment({ occurrenceDate: '2030-09-20', nextOccurrence: '2030-09-20' })])[0])).toEqual(['Date: Fri, Sep 20, 2030']);
  });
});

describe('Manage Moments', () => {
  it('opens on Scheduled, counts every tab, and switches between them', async () => {
    load([scheduled('s', '2030-09-20'), moment({ id: 'r', title: 'Ready one', festivalSettings: approved })]);
    await render(<ManageMoments />);
    expect(screen.getByTestId('manage-filter-Scheduled').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByText('Scheduled (1)')).toBeTruthy();
    expect(screen.getByText('Need Review (0)')).toBeTruthy();
    expect(screen.getByText('Ready to Schedule (1)')).toBeTruthy();
    expect(within(screen.getByTestId('manage-moment-s')).getByText('Scheduled: Fri, Sep 20, 2030')).toBeTruthy();
    expect(screen.queryByTestId('manage-moment-r')).toBeNull();

    await fireEvent.press(screen.getByTestId('manage-filter-Ready to Schedule'));
    expect(screen.getByTestId('manage-moment-r')).toBeTruthy();
    expect(screen.queryByTestId('manage-moment-s')).toBeNull();
  });

  it('says a tab is empty, and opens Manage Moment for a greeting-card group', async () => {
    load([scheduled('s', '2030-09-20')]);
    await render(<ManageMoments />);
    await fireEvent.press(screen.getByTestId('manage-filter-Need Review'));
    expect(screen.getByText('No moments in Need Review')).toBeTruthy();
    expect(screen.getByText('Choose another tab to manage your moments.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('manage-filter-Scheduled'));
    await fireEvent.press(screen.getByTestId('manage-moment-s'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/wellness/moments/manage', params: { ids: 's' } });
  });

  it('shows "No moments yet" with nothing to manage', async () => {
    load([]);
    await render(<ManageMoments />);
    expect(screen.getByText('No moments yet')).toBeTruthy();
    expect(screen.queryByTestId('manage-filter-empty')).toBeNull();
  });
});
