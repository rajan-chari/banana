package com.emcom.android.data.api

import retrofit2.http.*

interface EmcomApi {

    // Identity (no auth needed for register/who)
    @POST("register")
    suspend fun register(@Body request: RegisterRequest): IdentityDto

    @DELETE("register/{name}")
    suspend fun unregister(@Path("name") name: String): Map<String, String>

    @GET("who")
    suspend fun who(): List<IdentityDto>

    @PATCH("who/{name}")
    suspend fun updateDescription(
        @Path("name") name: String,
        @Body body: Map<String, String>
    ): IdentityDto

    // Email
    @POST("email")
    suspend fun sendEmail(@Body request: SendEmailRequest): EmailDto

    @GET("email/inbox")
    suspend fun inbox(@Query("all") all: Boolean = false): List<EmailDto>

    @GET("email/sent")
    suspend fun sent(): List<EmailDto>

    @GET("email/all")
    suspend fun allMail(): List<EmailDto>

    @GET("email/{id}")
    suspend fun getEmail(
        @Path("id") id: String,
        @Query("add_tags") addTags: String? = null
    ): EmailDto

    // Threads
    @GET("threads")
    suspend fun threads(): List<ThreadDto>

    @GET("threads/{id}")
    suspend fun getThread(@Path("id") id: String): List<EmailDto>

    // Tags
    @POST("email/{id}/tags")
    suspend fun addTags(
        @Path("id") id: String,
        @Body request: AddTagsRequest
    ): Map<String, Any>

    @DELETE("email/{id}/tags/{tag}")
    suspend fun removeTag(
        @Path("id") id: String,
        @Path("tag") tag: String
    ): Map<String, String>

    @GET("email/tags/{tag}")
    suspend fun emailsByTag(@Path("tag") tag: String): List<EmailDto>

    // Search
    @GET("search")
    suspend fun search(
        @Query("from_") from: String? = null,
        @Query("to") to: String? = null,
        @Query("subject") subject: String? = null,
        @Query("tag") tag: String? = null,
        @Query("body") body: String? = null
    ): List<EmailDto>

    // Health (no auth)
    @GET("health")
    suspend fun health(): HealthResponse

    // Names (no auth)
    @GET("names")
    suspend fun names(): List<String>
}
