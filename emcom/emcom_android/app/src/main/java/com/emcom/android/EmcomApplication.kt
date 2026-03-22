package com.emcom.android

import android.app.Application
import com.emcom.android.data.local.IdentityStore
import com.emcom.android.data.repository.EmcomRepository

class EmcomApplication : Application() {

    lateinit var identityStore: IdentityStore
        private set
    lateinit var repository: EmcomRepository
        private set

    override fun onCreate() {
        super.onCreate()
        identityStore = IdentityStore(this)
        repository = EmcomRepository(identityStore)
    }
}
