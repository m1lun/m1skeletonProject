// Seller listing (see .claude/Feature1_Plan.md). Stored in the `listings`
// collection; photos live in Google Cloud Storage and are referenced by URL.
import type { Attribute, Condition, GeoPoint, PostStatus } from './common';

export const LISTINGS_COLLECTION = 'listings';

export interface Listing {
  id: string;
  ownerId: string;
  category: string;
  price: number;
  condition: Condition;
  description: string;
  address: string;
  location: GeoPoint;
  photoUrls: string[];
  attributes: Attribute[];
  status: PostStatus;
  createdAt: Date;
  updatedAt: Date;
}
