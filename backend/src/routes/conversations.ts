import { Router } from 'express';
import type { Request, Response } from 'express';

import { BadRequestError } from '../errors';
import { isOneOf } from '../models/common';
import {
  DEFAULT_MESSAGES_PAGE,
  MAX_MESSAGE_LENGTH,
  MAX_MESSAGES_PAGE,
  POST_KINDS,
  isParticipant,
  otherParticipant,
  type Conversation,
  type PostKind,
} from '../models/conversation';
import type { PublicUser } from '../models/user';
import { currentUser } from '../sessions';
import type { Store } from '../store/types';
import { isObject, type Body } from './checks';
import { handle } from './handle';
import { parsePageQuery, toPage } from './paging';

const POST_ID = /^[0-9a-f]{24}$/;
const OPEN_FIELDS = ['postId', 'postKind'];
const MESSAGE_FIELDS = ['text'];
const MESSAGES_PAGE = { fallback: DEFAULT_MESSAGES_PAGE, max: MAX_MESSAGES_PAGE };

// The fields of a listing or request the conversations list shows.
interface PostView {
  id?: string;
  name?: string;
  status?: string;
  photoIds?: string[];
}

interface Lookups {
  userOf: Map<string, PublicUser>;
  listingOf: Map<string, PostView>;
  requestOf: Map<string, PostView>;
}

function bodyFields(body: unknown, allowed: string[]): { fields: Body; errors: string[] } {
  if (!isObject(body)) {
    return { fields: {}, errors: ['Request body must be a JSON object'] };
  }
  const errors = Object.keys(body)
    .filter((name) => !allowed.includes(name))
    .map((name) => `unsupported field "${name}"`);
  return { fields: body, errors };
}

function parseOpen(body: unknown): { postId: string; postKind: PostKind } {
  const { fields, errors } = bodyFields(body, OPEN_FIELDS);
  const postId = typeof fields.postId === 'string' && POST_ID.test(fields.postId) ? fields.postId : undefined;
  const postKind = typeof fields.postKind === 'string' && isOneOf(POST_KINDS, fields.postKind) ? fields.postKind : undefined;
  if (postId === undefined) {
    errors.push('postId must be the id of a listing or request');
  }
  if (postKind === undefined) {
    errors.push(`postKind must be one of: ${POST_KINDS.join(', ')}`);
  }
  if (errors.length > 0 || postId === undefined || postKind === undefined) {
    throw new BadRequestError(errors);
  }
  return { postId, postKind };
}

function parseMessage(body: unknown): string {
  const { fields, errors } = bodyFields(body, MESSAGE_FIELDS);
  const text = typeof fields.text === 'string' ? fields.text.trim() : '';
  if (text === '' || text.length > MAX_MESSAGE_LENGTH) {
    errors.push(`text must be 1 to ${MAX_MESSAGE_LENGTH} characters`);
  }
  if (errors.length > 0) {
    throw new BadRequestError(errors);
  }
  return text;
}

function byId(items: PostView[]): Map<string, PostView> {
  return new Map(items.flatMap((item) => (item.id === undefined ? [] : [[item.id, item] as const])));
}

function idsOfKind(conversations: Conversation[], kind: PostKind): string[] {
  return [...new Set(conversations.filter((c) => c.postKind === kind).map((c) => c.postId))];
}

function conversationView(conversation: Conversation, me: string, lookups: Lookups) {
  const other = otherParticipant(conversation, me);
  const posts = conversation.postKind === 'listing' ? lookups.listingOf : lookups.requestOf;
  const post = posts.get(conversation.postId);
  return {
    id: conversation.id,
    post:
      post === undefined
        ? null
        : { id: conversation.postId, kind: conversation.postKind, name: post.name, status: post.status, photoId: post.photoIds?.[0] ?? null },
    otherUser: lookups.userOf.get(other) ?? { id: other, firstName: '', lastName: '', pictureUrl: null },
    lastMessage: conversation.lastMessage,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

// The caller's conversation. Sends the 404 or 403 itself and returns null when there is none.
async function findMyConversation(store: Store, req: Request, res: Response): Promise<Conversation | null> {
  const conversation = await store.conversations.findById(String(req.params.id));
  if (conversation === null) {
    res.status(404).json({ error: 'Not Found' });
    return null;
  }
  if (!isParticipant(conversation, currentUser(res).id)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return conversation;
}

export function createConversationsRouter(store: Store): Router {
  const router = Router();

  // POST /api/conversations — `{ postId, postKind }` opens the caller's conversation with the post's owner,
  // or returns the one already open: 201 if it was created, 200 if it existed.
  router.post('/', handle(async (req, res) => {
    const { postId, postKind } = parseOpen(req.body);
    const me = currentUser(res).id;
    const posts = postKind === 'listing' ? store.listings : store.requests;
    const post = await posts.findById(postId);
    if (post === null) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }
    if (post.ownerId === me) {
      throw new BadRequestError(['you cannot start a conversation about your own post']);
    }
    if (post.status === 'closed') {
      res.status(409).json({ error: 'This post is closed' });
      return;
    }
    const now = new Date();
    const { conversation, created } = await store.conversations.open({
      postId,
      postKind,
      postOwnerId: post.ownerId,
      starterId: me,
      lastMessage: null,
      createdAt: now,
      updatedAt: now,
    });
    res.status(created ? 201 : 200).json(conversation);
  }));

  // GET /api/conversations — the caller's conversations, newest activity first, in at most 4 queries.
  router.get('/', handle(async (_req, res) => {
    const me = currentUser(res).id;
    const conversations = await store.conversations.listByUser(me);
    const others = [...new Set(conversations.map((c) => otherParticipant(c, me)))];
    const [users, listings, requests] = await Promise.all([
      store.users.findPublicByIds(others),
      store.listings.findByIds(idsOfKind(conversations, 'listing'), ['name', 'status', 'photoIds'], true),
      store.requests.findByIds(idsOfKind(conversations, 'request'), ['name', 'status', 'photoIds'], true),
    ]);
    const lookups: Lookups = {
      userOf: new Map(users.map((user) => [user.id, user])),
      listingOf: byId(listings),
      requestOf: byId(requests),
    };
    res.json({ conversations: conversations.map((c) => conversationView(c, me, lookups)) });
  }));

  // GET /api/conversations/:id/messages?limit=30&before=<nextCursor> — newest first; nextCursor is null on the last page.
  router.get('/:id/messages', handle(async (req, res) => {
    const { limit, before } = parsePageQuery(req.query, MESSAGES_PAGE);
    const conversation = await findMyConversation(store, req, res);
    if (conversation === null) {
      return;
    }
    // One extra message tells whether another page follows.
    const found = await store.messages.listByConversation(conversation.id, limit + 1, before);
    const { page, nextCursor } = toPage(found, limit);
    res.json({ messages: page, nextCursor });
  }));

  // POST /api/conversations/:id/messages — `{ text }` sends a message from the caller.
  router.post('/:id/messages', handle(async (req, res) => {
    const text = parseMessage(req.body);
    const conversation = await findMyConversation(store, req, res);
    if (conversation === null) {
      return;
    }
    const senderId = currentUser(res).id;
    const createdAt = new Date();
    const message = await store.messages.insert({ conversationId: conversation.id, senderId, text, createdAt });
    await store.conversations.recordMessage(conversation.id, { senderId, text, createdAt });
    res.status(201).json(message);
  }));

  return router;
}
