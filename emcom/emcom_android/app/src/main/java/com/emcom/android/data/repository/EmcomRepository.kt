package com.emcom.android.data.repository

import com.emcom.android.data.api.*
import com.emcom.android.data.local.IdentityStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first

class EmcomRepository(
    private val identityStore: IdentityStore
) {
    private val authInterceptor = AuthInterceptor()
    private var api: EmcomApi? = null
    private var currentBaseUrl: String? = null

    val identity: Flow<LocalIdentity?> = identityStore.identity

    fun isConfigured(): Boolean = api != null

    fun configure(baseUrl: String, identityName: String? = null) {
        if (baseUrl != currentBaseUrl) {
            api = ApiClientFactory.create(baseUrl, authInterceptor)
            currentBaseUrl = baseUrl
        }
        identityName?.let { authInterceptor.identityName = it }
    }

    private fun requireApi(): EmcomApi =
        api ?: throw IllegalStateException("Not connected. Call configure() first.")

    // Health
    suspend fun health(): Result<HealthResponse> = runCatching {
        requireApi().health()
    }

    // Identity
    suspend fun register(
        name: String? = null,
        description: String = "",
        force: Boolean = false
    ): Result<IdentityDto> = runCatching {
        val result = requireApi().register(RegisterRequest(name, description, force = force))
        authInterceptor.identityName = result.name
        identityStore.saveIdentity(result.name, currentBaseUrl!!, result.registeredAt)
        result
    }

    suspend fun who(): Result<List<IdentityDto>> = runCatching {
        requireApi().who()
    }

    suspend fun names(): Result<List<String>> = runCatching {
        requireApi().names()
    }

    // Email
    suspend fun sendEmail(
        to: List<String>,
        subject: String,
        body: String,
        cc: List<String> = emptyList(),
        inReplyTo: String? = null
    ): Result<EmailDto> = runCatching {
        requireApi().sendEmail(SendEmailRequest(to, cc, subject, body, inReplyTo))
    }

    suspend fun inbox(all: Boolean = false): Result<List<EmailDto>> = runCatching {
        requireApi().inbox(all)
    }

    suspend fun sent(): Result<List<EmailDto>> = runCatching {
        requireApi().sent()
    }

    suspend fun allMail(): Result<List<EmailDto>> = runCatching {
        requireApi().allMail()
    }

    suspend fun getEmail(id: String, addTags: String? = null): Result<EmailDto> = runCatching {
        requireApi().getEmail(id, addTags)
    }

    suspend fun reply(emailId: String, body: String): Result<EmailDto> {
        return runCatching {
            val original = requireApi().getEmail(emailId)
            val myName = authInterceptor.identityName ?: error("No identity set")
            val recipients = buildSet {
                add(original.sender)
                addAll(original.to)
                addAll(original.cc)
                remove(myName)
            }.toList()
            requireApi().sendEmail(
                SendEmailRequest(
                    to = recipients,
                    subject = "",  // server auto-prefixes "Re: "
                    body = body,
                    inReplyTo = original.id
                )
            )
        }
    }

    // Threads
    suspend fun threads(): Result<List<ThreadDto>> = runCatching {
        requireApi().threads()
    }

    suspend fun getThread(id: String): Result<List<EmailDto>> = runCatching {
        requireApi().getThread(id)
    }

    // Tags
    suspend fun addTags(emailId: String, tags: List<String>): Result<Unit> = runCatching {
        requireApi().addTags(emailId, AddTagsRequest(tags))
    }

    suspend fun removeTag(emailId: String, tag: String): Result<Unit> = runCatching {
        requireApi().removeTag(emailId, tag)
    }

    // Search
    suspend fun search(
        from: String? = null,
        to: String? = null,
        subject: String? = null,
        tag: String? = null,
        body: String? = null
    ): Result<List<EmailDto>> = runCatching {
        requireApi().search(from, to, subject, tag, body)
    }

    // Session management
    suspend fun restoreSession(): Boolean {
        val saved = identityStore.identity.first() ?: return false
        configure(saved.server, saved.name)
        return health().isSuccess
    }

    suspend fun logout() {
        authInterceptor.identityName = null
        api = null
        currentBaseUrl = null
        identityStore.clear()
    }
}
