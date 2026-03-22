package com.emcom.android.data.api

import com.google.gson.annotations.SerializedName

// === Responses ===

data class EmailDto(
    val id: String,
    @SerializedName("thread_id") val threadId: String,
    val sender: String,
    val to: List<String>,
    val cc: List<String>,
    val subject: String,
    val body: String,
    @SerializedName("in_reply_to") val inReplyTo: String?,
    @SerializedName("created_at") val createdAt: String,
    val tags: List<String> = emptyList()
)

data class IdentityDto(
    val name: String,
    val description: String,
    val location: String,
    @SerializedName("registered_at") val registeredAt: String,
    @SerializedName("last_seen") val lastSeen: String,
    val active: Int // Server returns 0/1, not boolean
) {
    val isActive: Boolean get() = active == 1
}

data class ThreadDto(
    @SerializedName("thread_id") val threadId: String,
    val subject: String,
    val participants: List<String>,
    @SerializedName("email_count") val emailCount: Int,
    @SerializedName("last_activity") val lastActivity: String
)

data class HealthResponse(
    val status: String
)

// === Requests ===

data class RegisterRequest(
    val name: String? = null,
    val description: String = "",
    val location: String = "",
    val force: Boolean = false
)

data class SendEmailRequest(
    val to: List<String>,
    val cc: List<String> = emptyList(),
    val subject: String = "",
    val body: String = "",
    @SerializedName("in_reply_to") val inReplyTo: String? = null
)

data class AddTagsRequest(
    val tags: List<String>
)

// === Local persistence ===

data class LocalIdentity(
    val name: String,
    val server: String,
    val registeredAt: String
)
