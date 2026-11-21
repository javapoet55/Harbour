// expo-router 57 ships query-string 7, whose decoder (decode-uri-component 0.2.2) can be made to hang on
// a crafted percent-encoded string (GHSA-qr28-fpjm-wq7f). There is no fixed release query-string 7 can
// load; Expo SDK 58 drops it. The advisory is accepted in .github/audit-accepted.json on one condition,
// which this test holds in place: the parser Expo Router runs on incoming links never calls that decoder.
// Only the bundled React Navigation parser does, and Expo Router replaces it with its own.
//
// If this fails after an Expo update, links from outside the app reach the vulnerable decoder again:
// do not ship until the advisory is resolved. If only the import paths moved, point them at the new ones.
const mockDecoder = jest.fn((value: string) => value);
jest.mock('decode-uri-component', () => mockDecoder);

const routes = { screens: { index: '', tasks: 'tasks', '[...missing]': '*' } };
const hostile = [
  `/tasks?a=${'%E0%A4%A'.repeat(200)}`,
  '/tasks?a=%&b=%ZZ&c=%E0%A4',
  `/tasks?${'%C3'.repeat(500)}=1`,
  `nexdo://tasks?next=${'%F0%9F'.repeat(300)}`,
];

beforeEach(() => mockDecoder.mockClear());

it('parses incoming links without the vulnerable decoder', () => {
  const { getStateFromPath } = require('expo-router/build/link/linking');
  for (const link of hostile) {
    const started = Date.now();
    expect(() => getStateFromPath(link, routes, [])).not.toThrow();
    expect(Date.now() - started).toBeLessThan(1000);
  }
  expect(mockDecoder).not.toHaveBeenCalled();
});

it('still reads ordinary query parameters', () => {
  const { getStateFromPath } = require('expo-router/build/link/linking');
  const state = getStateFromPath('/tasks?filter=today&q=caf%C3%A9', routes, []);
  expect(state.routes[0]).toMatchObject({ name: 'tasks', params: { filter: 'today', q: 'café' } });
  expect(mockDecoder).not.toHaveBeenCalled();
});

it('would notice: the parser Expo Router replaces does call the decoder', () => {
  const core = require('expo-router/build/react-navigation/core');
  core.getStateFromPath('/tasks?a=1', routes);
  expect(mockDecoder).toHaveBeenCalled();
});
