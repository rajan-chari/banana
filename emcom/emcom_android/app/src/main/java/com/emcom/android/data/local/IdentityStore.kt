package com.emcom.android.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.emcom.android.data.api.LocalIdentity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "emcom_identity")

class IdentityStore(private val context: Context) {

    private object Keys {
        val SERVER_URL = stringPreferencesKey("server_url")
        val IDENTITY_NAME = stringPreferencesKey("identity_name")
        val REGISTERED_AT = stringPreferencesKey("registered_at")
    }

    val identity: Flow<LocalIdentity?> = context.dataStore.data.map { prefs ->
        val name = prefs[Keys.IDENTITY_NAME] ?: return@map null
        val server = prefs[Keys.SERVER_URL] ?: return@map null
        val registeredAt = prefs[Keys.REGISTERED_AT] ?: ""
        LocalIdentity(name, server, registeredAt)
    }

    val serverUrl: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[Keys.SERVER_URL]
    }

    suspend fun saveIdentity(name: String, server: String, registeredAt: String) {
        context.dataStore.edit { prefs ->
            prefs[Keys.IDENTITY_NAME] = name
            prefs[Keys.SERVER_URL] = server
            prefs[Keys.REGISTERED_AT] = registeredAt
        }
    }

    suspend fun saveServerUrl(url: String) {
        context.dataStore.edit { prefs ->
            prefs[Keys.SERVER_URL] = url
        }
    }

    suspend fun clear() {
        context.dataStore.edit { it.clear() }
    }
}
