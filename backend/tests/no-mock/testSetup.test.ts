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
  test('Real Store Round Trip', async () => {
    const listing = await makeListing(mongo.store, ME);

    expect(listing.id).toMatch(/^[0-9a-f]{24}$/);
    expect(await mongo.store.listings.findById(listing.id)).toStrictEqual(listing);
    expect(await mongo.db.collection('listings').countDocuments()).toBe(1);
  });

  test('Fixtures Are Valid', async () => {
    const listing = await makeListing(mongo.store, ME);
    const request = await makeRequest(mongo.store, OTHER);
    const deal = await makeDeal(mongo.store, { sellerId: ME, buyerId: OTHER }, { listingId: listing.id, requestId: request.id });
    const rating = await makeRating(mongo.store, { dealId: deal.id, raterId: ME, ratedUserId: OTHER, stars: 4 });
    await makeReputation(mongo.store, OTHER, [4]);

    expect(await mongo.store.deals.listByUser(ME, 10)).toContainEqual(deal);
    expect(await mongo.store.ratings.listByDeals([deal.id])).toStrictEqual([
      { id: rating.id, dealId: deal.id, raterId: ME, stars: 4, comment: '', createdAt: rating.createdAt },
    ]);
    expect(await mongo.store.reputations.find(OTHER)).toMatchObject({ userId: OTHER, starSum: 4, ratingCount: 1 });
  });

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
