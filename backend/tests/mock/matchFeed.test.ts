import jwt from 'jsonwebtoken';
import request from 'supertest';

import { createApp } from '../../src/app';
import * as travelTime from '../../src/matching/travelTime';
import type { Listing } from '../../src/models/listing';
import type { BuyerRequest } from '../../src/models/request';
import type { Store } from '../../src/store/types';
import { MemoryPostCollection, newListing, newRequest } from '../helpers/memoryPostCollection';
import { MemorySessionRepo } from '../helpers/memorySessionRepo';

const JWT_SECRET = process.env.JWT_SECRET ?? '';
const ME = 'user-me';
const OTHER = 'user-other';

const sessionToken = jwt.sign({ email: 'ada@example.com' }, JWT_SECRET, {
  subject: ME,
  issuer: 'matchmarket-backend',
  audience: 'matchmarket-app',
  expiresIn: 60,
});

interface MatchBody {
  matches: { post: { id: string }; travelMinutes: number | null }[];
  nextCursor: string | null;
}

let listings: MemoryPostCollection<Listing>;
let requests: MemoryPostCollection<BuyerRequest>;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  listings = new MemoryPostCollection<Listing>();
  requests = new MemoryPostCollection<BuyerRequest>();
  // The feed only reads posts, so the rest of the store is never touched.
  app = createApp({ sessions: new MemorySessionRepo(), store: { listings, requests } as unknown as Store });
});

afterEach(() => {
  jest.restoreAllMocks();
});

function getFeed(query: string): request.Test {
  return request(app).get(`/api/feed${query}`).set('Authorization', `Bearer ${sessionToken}`);
}

// Interface GET /api/feed
describe('Mocked: GET /api/feed', () => {
  // Input: GET ?postId=<my request>
  // Expected status code: 500
  // Expected behavior: the error is logged; database unchanged
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: loading the candidate listings rejects with a database error
  test('Database failure loading candidates', async () => {
    const mine = await requests.insert(newRequest(ME));
    jest.spyOn(listings, 'listOpenInCategory').mockRejectedValue(new Error('MongoDB is unreachable'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await getFeed(`?postId=${mine.id}`);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal Server Error' });
  });

  // Input: GET ?postId=<any well-formed id>
  // Expected status code: 500
  // Expected behavior: the error is logged; database unchanged
  // Expected output: { error: "Internal Server Error" }
  // Mocked behavior: looking up the post rejects with a database error
  test('Database failure loading the post', async () => {
    jest.spyOn(requests, 'findById').mockRejectedValue(new Error('MongoDB is unreachable'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await getFeed('?postId=000000000000000000000001');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal Server Error' });
  });

  // Input: GET ?postId=<my request>&limit=1, then the second page; two listings match
  // Expected status code: 200
  // Expected behavior: travel times are requested once, for the first page only
  // Expected output: first page: travelMinutes 12; second page: travelMinutes null
  // Mocked behavior: the routing service returns 12 minutes
  test('Travel times on the first page only', async () => {
    const mine = await requests.insert(newRequest(ME));
    await listings.insert(newListing(OTHER, { price: 10 }));
    await listings.insert(newListing(OTHER, { price: 20 }));
    const routing = jest.spyOn(travelTime, 'travelTimes').mockResolvedValue([12]);

    const page1 = await getFeed(`?postId=${mine.id}&limit=1`);
    const body1 = page1.body as MatchBody;
    const page2 = await getFeed(`?postId=${mine.id}&limit=1&cursor=${body1.nextCursor ?? ''}`);

    expect(page1.status).toBe(200);
    expect(body1.matches[0]?.travelMinutes).toBe(12);
    expect(page2.status).toBe(200);
    expect((page2.body as MatchBody).matches[0]?.travelMinutes).toBeNull();
    expect(routing).toHaveBeenCalledTimes(1);
    expect(routing).toHaveBeenCalledWith(mine.location, [mine.location], 'walk');
  });

  // Input: GET ?postId=<my request>; one listing matches
  // Expected status code: 200
  // Expected behavior: the feed is still returned, as the routing NFR requires
  // Expected output: { matches: [the listing, travelMinutes null], nextCursor: null }
  // Mocked behavior: the routing service rejects
  test('Routing service failure still returns the feed', async () => {
    const mine = await requests.insert(newRequest(ME));
    const listing = await listings.insert(newListing(OTHER));
    jest.spyOn(travelTime, 'travelTimes').mockRejectedValue(new Error('429 Too Many Requests'));

    const response = await getFeed(`?postId=${mine.id}`);

    expect(response.status).toBe(200);
    const body = response.body as MatchBody;
    expect(body.matches.map((match) => match.post.id)).toEqual([listing.id]);
    expect(body.matches[0]?.travelMinutes).toBeNull();
  });
});
