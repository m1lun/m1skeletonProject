export const RATINGS_COLLECTION = 'ratings';

export interface Rating {
  id: string;
  dealId: string;
  raterId: string;
  ratedUserId: string;
  stars: number;
  comment: string;
  createdAt: Date;
  // Set when the rating is edited; ratings made before editing existed do not have it.
  updatedAt?: Date;
}
