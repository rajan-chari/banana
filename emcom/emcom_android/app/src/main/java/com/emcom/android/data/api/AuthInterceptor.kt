package com.emcom.android.data.api

import okhttp3.Interceptor
import okhttp3.Response

class AuthInterceptor : Interceptor {
    @Volatile
    var identityName: String? = null

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val name = identityName ?: return chain.proceed(request)
        val newRequest = request.newBuilder()
            .addHeader("X-Emcom-Name", name)
            .build()
        return chain.proceed(newRequest)
    }
}
