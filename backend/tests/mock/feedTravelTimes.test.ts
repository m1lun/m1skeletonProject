import type { Server } from 'node:http';

import request from 'supertest';

import { env } from '../../src/config/env';
import * as travelTime from '../../src/matching/travelTime';
import { ORS_MATRIX_URL, orsProfile, type TravelMode } from '../../src/matching/travelTime';
import type { GeoPoint } from '../../src/models/common';
import { ME, OTHER, bearer, clearDealData, makeListing, makeRequest } from '../helpers/dealFixtures';
import { startTestApp, stopTestApp } from '../helpers/testApp';
import { createTestStore, type TestStore } from '../helpers/testStore';

let mongo: TestStore;
let app: Server;

beforeAll(async () => {
  mongo = await createTestStore();
  app = await startTestApp(mongo.store);
});

afterAll(async () => {
  await stopTestApp(app);
  await mongo.dropAndClose();
});

beforeEach(async () => {
  await clearDealData(mongo.db);
  jest.replaceProperty(env, 'orsApiKey', ORS_KEY);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const ORS_KEY = 'test-ors-key';
// About 0.7 km east of the fixtures' location, so this listing ranks second.
const FARTHER: GeoPoint = { type: 'Point', coordinates: [-123.24, 49.26] };

// My request, and two of another user's listings that match it: the nearer one ranks first.
async function makeFeed(): Promise<{ requestId: string; nearId: string; farId: string }> {
  const buyerRequest = await makeRequest(mongo.store, ME);
  const near = await makeListing(mongo.store, OTHER);
  const far = await makeListing(mongo.store, OTHER, { location: FARTHER });
  return { requestId: buyerRequest.id, nearId: near.id, farId: far.id };
}

function getFeed(query: string): request.Test {
  return request(app).get(`/api/feed?${query}`).set('Authorization', bearer(ME));
}

function routingResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// Interface GET /api/feed
describe('Mocked: GET /api/feed', () => {
  // Mocked behavior: OpenRouteService returns 600 seconds to the nearer listing and no route to the other
  // Input: the id of my open request, which two listings match
  // Expected status code: 200
  // Expected behavior: one walking matrix request with the API key, from my request to both listings in rank order
  // Expected output: travelMinutes 10 and null, travelTimesAvailable true, travelMode walk
  test('Travel Times From The Routing Service', async () => {
    const { requestId, nearId, farId } = await makeFeed();
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(routingResponse({ durations: [[600, null]] }));

    const response = await getFeed(`postId=${requestId}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      matches: [
        { post: { id: nearId }, travelMinutes: 10 },
        { post: { id: farId }, travelMinutes: null },
      ],
      travelMode: 'walk',
      travelTimesAvailable: true,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe(`${ORS_MATRIX_URL}/${orsProfile('walk')}`);
    expect(init?.headers).toMatchObject({ Authorization: ORS_KEY });
    expect(JSON.parse(String(init?.body))).toEqual({
      locations: [
        [-123.25, 49.26],
        [-123.25, 49.26],
        [-123.24, 49.26],
      ],
      sources: [0],
      destinations: [1, 2],
      metrics: ['duration'],
    });
  });

  // Mocked behavior: the viewer's travel mode is bike or drive (until preferences exist it is always walk),
  // and OpenRouteService returns 300 seconds to each listing
  // Input: the id of my open request, which two listings match
  // Expected status code: 200
  // Expected behavior: the matrix request uses that mode's OpenRouteService profile
  // Expected output: travelMinutes 5 for both matches, and that travelMode
  test.each([
    { mode: 'bike' as TravelMode, profile: 'cycling-regular' },
    { mode: 'drive' as TravelMode, profile: 'driving-car' },
  ])('Travel Mode $mode', async ({ mode, profile }: { mode: TravelMode; profile: string }) => {
    const { requestId } = await makeFeed();
    jest.replaceProperty(travelTime, 'DEFAULT_TRAVEL_MODE', mode);
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(routingResponse({ durations: [[300, 300]] }));

    const response = await getFeed(`postId=${requestId}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      matches: [{ travelMinutes: 5 }, { travelMinutes: 5 }],
      travelMode: mode,
      travelTimesAvailable: true,
    });
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(`${ORS_MATRIX_URL}/${profile}`);
  });

  // Mocked behavior: OpenRouteService answers 429 (rate limited), answers 500, or the request fails to connect
  // Input: the id of my open request, which two listings match
  // Expected status code: 200
  // Expected behavior: the ranked matches are still returned
  // Expected output: both matches with travelMinutes null, and travelTimesAvailable false
  test.each([
    { label: 'Rate Limited', install: (spy: jest.SpyInstance) => spy.mockResolvedValue(routingResponse({}, 429)) },
    { label: 'Server Error', install: (spy: jest.SpyInstance) => spy.mockResolvedValue(routingResponse({}, 500)) },
    { label: 'Unreachable', install: (spy: jest.SpyInstance) => spy.mockRejectedValue(new TypeError('fetch failed')) },
  ])('Routing Service $label', async ({ install }: { label: string; install: (spy: jest.SpyInstance) => void }) => {
    const { requestId, nearId, farId } = await makeFeed();
    install(jest.spyOn(global, 'fetch'));

    const response = await getFeed(`postId=${requestId}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      matches: [
        { post: { id: nearId }, travelMinutes: null },
        { post: { id: farId }, travelMinutes: null },
      ],
      travelTimesAvailable: false,
    });
  });

  // Mocked behavior: OpenRouteService answers 200 with one duration for two listings, or with no durations
  // Input: the id of my open request, which two listings match
  // Expected status code: 200
  // Expected behavior: the unusable answer is ignored
  // Expected output: travelMinutes null and travelTimesAvailable false
  test.each([
    { label: 'Too Few Durations', body: { durations: [[600]] } },
    { label: 'No Durations', body: { error: 'unexpected' } },
    { label: 'Non-Numeric Duration', body: { durations: [[600, 'soon']] } },
  ])('Routing Service Returns $label', async ({ body }: { label: string; body: unknown }) => {
    const { requestId } = await makeFeed();
    jest.spyOn(global, 'fetch').mockResolvedValue(routingResponse(body));

    const response = await getFeed(`postId=${requestId}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      matches: [{ travelMinutes: null }, { travelMinutes: null }],
      travelTimesAvailable: false,
    });
  });

  // Mocked behavior: no OpenRouteService API key is configured
  // Input: the id of my open request, which two listings match
  // Expected status code: 200
  // Expected behavior: the routing service is not called
  // Expected output: travelTimesAvailable false
  test('No API Key', async () => {
    const { requestId } = await makeFeed();
    jest.replaceProperty(env, 'orsApiKey', undefined);
    const fetchSpy = jest.spyOn(global, 'fetch');

    const response = await getFeed(`postId=${requestId}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ travelTimesAvailable: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Mocked behavior: OpenRouteService would return 600 seconds for any request
  // Input: the second page of my request's feed (limit 1, cursor 1), and a feed with no matches
  // Expected status code: 200
  // Expected behavior: the routing service is not called, since only a non-empty first page gets travel times
  // Expected output: travelTimesAvailable false
  test('Later Page Or Empty Feed', async () => {
    const { requestId, farId } = await makeFeed();
    const empty = await makeRequest(mongo.store, ME, { category: 'lamp' });
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(routingResponse({ durations: [[600]] }));

    const secondPage = await getFeed(`postId=${requestId}&limit=1&cursor=1`);
    const noMatches = await getFeed(`postId=${empty.id}`);

    expect(secondPage.status).toBe(200);
    expect(secondPage.body).toMatchObject({
      matches: [{ post: { id: farId }, travelMinutes: null }],
      travelTimesAvailable: false,
    });
    expect(noMatches.body).toMatchObject({ matches: [], travelTimesAvailable: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
