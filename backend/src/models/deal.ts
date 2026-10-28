export const DEALS_COLLECTION = 'deals';

// An accepted offer between a seller and a buyer. It is made from a listing, a
// request, or both; at least one of listingId and requestId is set.
export interface Deal {
  id: string;
  listingId: string | null;
  requestId: string | null;
  sellerId: string;
  buyerId: string;
  agreedPrice: number;
  createdAt: Date;
}
