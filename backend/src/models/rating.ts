export const RATINGS_COLLECTION = 'ratings';

// What one party of a deal thinks of the other. Each person rates a deal once.
export interface Rating {
  id: string;
  dealId: string;
  raterId: string;
  // The other party of the deal.
  ratedUserId: string;
  // A whole number from MIN_STARS to MAX_STARS.
  stars: number;
  // May be empty.
  comment: string;
  createdAt: Date;
}
