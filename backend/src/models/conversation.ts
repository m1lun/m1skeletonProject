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

// One conversation per post and user who started it, between that user and the post's owner.
export interface Conversation {
  id: string;
  postId: string;
  postKind: PostKind;
  postOwnerId: string;
  starterId: string;
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
  return conversation.postOwnerId === userId || conversation.starterId === userId;
}

export function otherParticipant(conversation: Conversation, userId: string): string {
  return conversation.postOwnerId === userId ? conversation.starterId : conversation.postOwnerId;
}
