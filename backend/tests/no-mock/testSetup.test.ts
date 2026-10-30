import { createTestStore, type TestStore } from '../helpers/testStore';
import { ME, OTHER, makeDeal, makeListing, makeRating, makeRequest, makeReputation } from '../helpers/dealFixtures';

let mongo: TestStore;

beforeAll(async () => {
  mongo = await createTestStore();
});

afterAll(async () => {
  await mongo.dropAndClose();
});

// Interface: test setup (real MongoDB, not an API)
describe('Unmocked: test setup', () => {
  // Input: a post stored through the real store
  // Expected status code: None
  // Expected behavior: the post is stored in the test database and read back
  // Expected output: the stored listing, with an id
  test('Real Store Round Trip', async () => {
    const listing = await makeListing(mongo.store, ME);

    expect(listing.id).toMatch(/^[0-9a-f]{24}$/);
    expect(await mongo.store.listings.findById(listing.id)).toStrictEqual(listing);
    expect(await mongo.db.collection('listings').countDocuments()).toBe(1);
  });

  // Input: a deal, its two posts, a rating and a reputation made with the fixtures
  // Expected status code: None
  // Expected behavior: the database accepts them and the deal and rating can be listed again
  // Expected output: the deal and the rating that were stored
  test('Fixtures Are Valid', async () => {
    const listing = await makeListing(mongo.store, ME);
    const request = await makeRequest(mongo.store, OTHER);
    const deal = await makeDeal(mongo.store, { sellerId: ME, buyerId: OTHER }, { listingId: listing.id, requestId: request.id });
    const rating = await makeRating(mongo.store, { dealId: deal.id, raterId: ME, ratedUserId: OTHER, stars: 4 });
    await makeReputation(mongo.store, OTHER, [4]);

    expect(await mongo.store.deals.listByUser(ME, 10)).toContainEqual(deal);
    // listByDeals returns only the fields the deals list shows.
    expect(await mongo.store.ratings.listByDeals([deal.id])).toStrictEqual([
      { id: rating.id, dealId: deal.id, raterId: ME, stars: 4, comment: '', createdAt: rating.createdAt },
    ]);
    expect(await mongo.store.reputations.find(OTHER)).toMatchObject({ userId: OTHER, starSum: 4, ratingCount: 1 });
  });

  // Input: a rating of 6 stars inserted straight into the test database
  // Expected status code: None
  // Expected behavior: the database rejects it, so the app's schemas are applied to the test database
  // Expected output: a document validation error (code 121)
  test('Schemas Are Applied', async () => {
    const insertion = mongo.db.collection('ratings').insertOne({
      dealId: 'd',
      raterId: ME,
      ratedUserId: OTHER,
      stars: 6,
      comment: '',
      createdAt: new Date(),
    });

    await expect(insertion).rejects.toMatchObject({ code: 121 });
  });
});
