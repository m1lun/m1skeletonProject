// Buyer request (see .claude/Feature1_Plan.md). Stored in `requests`.
import type { GeoPoint, PostStatus, Requirement } from './common';

export const REQUESTS_COLLECTION = 'requests';

export interface BuyerRequest {
  id: string;
  ownerId: string;
  category: string;
  description: string;
  address: string;
  location: GeoPoint;
  photoUrls: string[];
  requirements: Requirement[];
  status: PostStatus;
  createdAt: Date;
  updatedAt: Date;
}
