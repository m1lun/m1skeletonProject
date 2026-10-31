export const CONVERSATIONS_COLLECTION = 'conversations';
export const MESSAGES_COLLECTION = 'messages';

export const MAX_MESSAGE_LENGTH = 1000;
export const DEFAULT_MESSAGES_PAGE = 30;
export const MAX_MESSAGES_PAGE = 50;

export const POST_KINDS = ['listing', 'request'] as const;
export type PostKind = (typeof POST_KINDS)[number];

export interface LastMessage {
  senderId: string;
  text: string;
  createdAt: Date;
}

// Shaped like a Deal, so accepting a proposal copies the posts and parties across.
// postKind says which post was tapped to start it; the other post, if any, is the
// starter's own post it was recommended for. One conversation per tapped post and starter.
export interface Conversation {
  id: string;
  listingId: string | null;
  requestId: string | null;
  sellerId: string;
  buyerId: string;
  postKind: PostKind;
  // Copied from the newest message so the conversations list needs no query per conversation.
  lastMessage: LastMessage | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  createdAt: Date;
}

export function isParticipant(conversation: Conversation, userId: string): boolean {
  return conversation.sellerId === userId || conversation.buyerId === userId;
}

export function otherParticipant(conversation: Conversation, userId: string): string {
  return conversation.sellerId === userId ? conversation.buyerId : conversation.sellerId;
}
