export const REPUTATIONS_COLLECTION = 'reputations';

// One row per user who has been rated, so a score is a single lookup rather
// than a recount of their ratings.
export interface Reputation {
  // Google account id (`sub`).
  userId: string;
  starSum: number;
  ratingCount: number;
  // starSum / ratingCount, kept in step with the two fields above.
  score: number;
  updatedAt: Date;
}
