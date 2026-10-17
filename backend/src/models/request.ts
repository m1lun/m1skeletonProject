import type { GeoPoint, PostStatus, RequestField } from './common';

export const REQUESTS_COLLECTION = 'requests';

export interface BuyerRequest {
  id: string;
  ownerId: string;
  category: string;
  description: string;
  address: string;
  location: GeoPoint;
  photoUrls: string[];
  requestFields: RequestField[];
  status: PostStatus;
  createdAt: Date;
  updatedAt: Date;
}
