export const DEALS_COLLECTION = 'deals';

export interface Deal {
  id: string;
  listingId: string | null;
  requestId: string | null;
  sellerId: string;
  buyerId: string;
  agreedPrice: number;
  createdAt: Date;
}
