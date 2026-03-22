package com.emcom.android.data.api

import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object ApiClientFactory {
    fun create(baseUrl: String, authInterceptor: AuthInterceptor): EmcomApi {
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }

        val okhttp = OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .addInterceptor(logging)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()

        val url = baseUrl.trimEnd('/') + "/"

        return Retrofit.Builder()
            .baseUrl(url)
            .client(okhttp)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(EmcomApi::class.java)
    }
}
