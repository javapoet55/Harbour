import { render, screen } from '@testing-library/react-native';

import { canonicalZone, sameZone } from '../dates';
import { knownTimeZones, ZonePicker } from '../form';

/**
 * The India time zone. Swift's pickers list `TimeZone.knownTimeZoneIdentifiers`, which spells India
 * `Asia/Calcutta`, while the phone reports `Asia/Kolkata`; no row matches and the Time zone row is
 * blank (MomentEditor.swift:44, ManageFestivalView.swift:187; §22 "For the team"). The port treats the
 * two spellings as one zone and always shows `Asia/Kolkata`.
 */
const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
const original = intl.supportedValuesOf;
afterEach(() => {
  intl.supportedValuesOf = original;
});

describe('canonicalZone', () => {
  it('names India Asia/Kolkata whichever spelling it is given', () => {
    expect(canonicalZone('Asia/Calcutta')).toBe('Asia/Kolkata');
    expect(canonicalZone('Asia/Kolkata')).toBe('Asia/Kolkata');
    expect(sameZone('Asia/Calcutta', 'Asia/Kolkata')).toBe(true);
  });

  it('maps the other legacy links ICU still lists, and leaves current names alone', () => {
    expect(canonicalZone('Europe/Kiev')).toBe('Europe/Kyiv');
    expect(canonicalZone('Asia/Katmandu')).toBe('Asia/Kathmandu');
    expect(canonicalZone('America/Los_Angeles')).toBe('America/Los_Angeles');
    expect(sameZone('Asia/Kolkata', 'Asia/Colombo')).toBe(false);
  });
});

describe('knownTimeZones', () => {
  it('lists India once, as Asia/Kolkata, when ICU spells it Asia/Calcutta', () => {
    intl.supportedValuesOf = () => ['America/New_York', 'Asia/Calcutta', 'UTC'];
    const zones = knownTimeZones(['Asia/Kolkata']);
    expect(zones).toContain('Asia/Kolkata');
    expect(zones).not.toContain('Asia/Calcutta');
    expect(zones.filter((zone) => zone === 'Asia/Kolkata')).toHaveLength(1);
  });

  it('keeps Asia/Kolkata in the stand-in list when Intl cannot list zones', () => {
    intl.supportedValuesOf = undefined;
    expect(knownTimeZones()).toContain('Asia/Kolkata');
  });
});

describe('ZonePicker', () => {
  it.each(['Asia/Kolkata', 'Asia/Calcutta'])('is never blank for India (%s)', async (value) => {
    intl.supportedValuesOf = () => ['Asia/Calcutta', 'Europe/London', 'UTC'];
    await render(<ZonePicker value={value} onChange={jest.fn()} testID="zone" />);
    expect(screen.getByTestId('zone').props.accessibilityLabel).toBe('Time zone, Asia/Kolkata');
  });
});
