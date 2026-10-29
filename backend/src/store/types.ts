import type { GeoPoint } from '../models/common';
import type { CustomField } from '../models/customField';
import type { Deal } from '../models/deal';
import type { Listing } from '../models/listing';
import type { Option } from '../models/option';
import type { Rating } from '../models/rating';
import type { BuyerRequest } from '../models/request';
import type { Reputation } from '../models/reputation';
import type { RefreshSession } from '../models/session';
import type { PhotoStorage } from '../photos/storage';

export interface PostDoc {
  id: string;
  ownerId: string;
  category: string;
  status: 'open' | 'closed';
  location: GeoPoint;
  updatedAt: Date;
}

// A post's price is a listing's price or a request's budget.
export interface PostFilter {
  category?: string | undefined;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  near?: { lat: number; lng: number; radiusKm: number } | undefined;
}

export interface OpenPostFilter extends PostFilter {
  before?: string | undefined;
}

// Posts (listings or requests) are stored without an id; the store assigns one.
export interface PostCollection<T extends PostDoc> {
  insert(doc: Omit<T, 'id'>): Promise<T>;
  findById(id: string): Promise<T | null>;
  listByOwner(ownerId: string): Promise<T[]>;
  replace(doc: T): Promise<T>;
  remove(id: string): Promise<void>;
  // Newest first; passing the last post's id as `before` starts the next page.
  listOpen(excludeOwnerId: string, limit: number, filter?: OpenPostFilter): Promise<T[]>;
  // Every open post in a category from everyone except excludeOwnerId: the
  // candidates the matching feed filters and ranks.
  listOpenInCategory(category: string, excludeOwnerId: string): Promise<T[]>;
  // One query for a page of posts; only the named fields are returned.
  findByIds(ids: string[], fields: (keyof T)[], firstPhotoOnly?: boolean): Promise<Partial<T>[]>;
}

export interface OptionCollection {
  list(field: string): Promise<Option[]>;
  // Inserts if missing and returns the stored option either way.
  ensure(option: Option): Promise<Option>;
  // Inserts every missing option in a single round trip; existing ones are untouched.
  ensureMany(options: Option[]): Promise<void>;
}

export interface CustomFieldCollection {
  list(ownerId: string): Promise<CustomField[]>;
  upsert(def: CustomField): Promise<CustomField>;
  remove(ownerId: string, key: string): Promise<boolean>;
}

export interface SessionRepo {
  insert(session: RefreshSession): Promise<void>;
  // Marks an unused, unexpired token as used and returns it, in one atomic
  // step so two concurrent refreshes cannot both succeed. Null otherwise.
  consume(tokenHash: string, now: Date): Promise<RefreshSession | null>;
  find(tokenHash: string): Promise<RefreshSession | null>;
  revokeFamily(familyId: string): Promise<void>;
}

export interface DealCollection {
  insert(doc: Omit<Deal, 'id'>): Promise<Deal>;
  findById(id: string): Promise<Deal | null>;
  listByUser(userId: string, limit: number, before?: string): Promise<Deal[]>;
}

export interface RatingUpdate {
  previousStars: number;
  rating: Rating;
}

export interface RatingCollection {
  insert(doc: Omit<Rating, 'id'>): Promise<Rating>;
  update(dealId: string, raterId: string, stars: number, comment: string, now: Date): Promise<RatingUpdate | null>;
  listByDeals(dealIds: string[]): Promise<Rating[]>;
  statsFor(userId: string): Promise<{ starSum: number; ratingCount: number }>;
}

export interface ReputationCollection {
  find(userId: string): Promise<Reputation | null>;
  findMany(userIds: string[]): Promise<Reputation[]>;
  addRating(userId: string, stars: number, now: Date): Promise<Reputation>;
  changeStars(userId: string, delta: number, now: Date): Promise<Reputation | null>;
}

export interface Store {
  listings: PostCollection<Listing>;
  requests: PostCollection<BuyerRequest>;
  options: OptionCollection;
  customFields: CustomFieldCollection;
  sessions: SessionRepo;
  deals: DealCollection;
  ratings: RatingCollection;
  reputations: ReputationCollection;
  photos: PhotoStorage;
  close(): Promise<void>;
}
