import type { GeoPoint } from '../models/common';
import type { CustomField } from '../models/customField';
import type { Listing } from '../models/listing';
import type { Option } from '../models/option';
import type { BuyerRequest } from '../models/request';
import type { RefreshSession } from '../models/session';
import type { PublicUser, SignInProfile, User } from '../models/user';
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

export interface UserCollection {
  // Creates the user at first sign-in. Later sign-ins refresh only the email and
  // photo: names are set once so an edit made in the app isn't undone. Leaving
  // pictureUrl out keeps the stored photo.
  upsertFromSignIn(profile: SignInProfile): Promise<void>;
  findById(id: string): Promise<User | null>;
  // The public fields of every user found, in one query; unknown ids are left out.
  findPublicByIds(ids: string[]): Promise<PublicUser[]>;
  // Sets the profile address, or clears it with null. Null if there is no such user.
  updateAddress(id: string, place: { address: string; location: GeoPoint } | null): Promise<User | null>;
}

export interface SessionRepo {
  insert(session: RefreshSession): Promise<void>;
  // Marks an unused, unexpired token as used and returns it, in one atomic
  // step so two concurrent refreshes cannot both succeed. Null otherwise.
  consume(tokenHash: string, now: Date): Promise<RefreshSession | null>;
  find(tokenHash: string): Promise<RefreshSession | null>;
  revokeFamily(familyId: string): Promise<void>;
}

export interface Store {
  listings: PostCollection<Listing>;
  requests: PostCollection<BuyerRequest>;
  options: OptionCollection;
  customFields: CustomFieldCollection;
  users: UserCollection;
  sessions: SessionRepo;
  photos: PhotoStorage;
  close(): Promise<void>;
}
