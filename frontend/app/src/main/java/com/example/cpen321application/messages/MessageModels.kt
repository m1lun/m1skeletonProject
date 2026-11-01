package com.example.cpen321application.messages

const val MAX_MESSAGE_LENGTH = 1000

data class ConversationPost(val id: String, val name: String, val isClosed: Boolean)

data class Conversation(
    val id: String,
    val otherUserId: String,
    val otherUserName: String,
    val listing: ConversationPost?,
    val request: ConversationPost?,
    val lastMessage: String?
)

data class ChatMessage(val id: String, val senderId: String, val text: String)

data class MessagesPage(val messages: List<ChatMessage>, val nextCursor: String?)
