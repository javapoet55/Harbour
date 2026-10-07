import { shoppingEmailApi, shoppingOffersApi } from './shopping';

/**
 * §22 "For the team": Swift's `ShoppingOffersView` and `ShoppingEmailView` put `listId` in the query without
 * percent-encoding. RN already encodes it in both requests; this pins it.
 */

const mockGet = jest.fn(async () => ({}));
jest.mock('./index', () => ({ ...jest.requireActual('./index'), getApi: () => ({ get: mockGet }) }));

const LIST_ID = 'list a&b=c/d?e';

it('percent-encodes the list id in the offers and weekly email requests', async () => {
  await shoppingOffersApi.offers(LIST_ID);
  await shoppingEmailApi.get(LIST_ID);
  expect(mockGet.mock.calls.map((call: unknown[]) => call[0])).toEqual([
    '/api/shopping/offers?listId=list%20a%26b%3Dc%2Fd%3Fe',
    '/api/shopping/email-schedule?listId=list%20a%26b%3Dc%2Fd%3Fe',
  ]);
});
