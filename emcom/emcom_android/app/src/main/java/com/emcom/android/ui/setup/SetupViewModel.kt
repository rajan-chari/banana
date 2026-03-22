package com.emcom.android.ui.setup

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.emcom.android.data.api.IdentityDto
import com.emcom.android.data.repository.EmcomRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class SetupUiState(
    val serverUrl: String = "",
    val serverConnected: Boolean = false,
    val checkingServer: Boolean = false,
    val serverError: String? = null,
    val availableNames: List<String> = emptyList(),
    val selectedName: String = "",
    val description: String = "",
    val registering: Boolean = false,
    val registerError: String? = null,
    val registered: Boolean = false
)

class SetupViewModel(private val repository: EmcomRepository) : ViewModel() {

    private val _state = MutableStateFlow(SetupUiState())
    val state: StateFlow<SetupUiState> = _state.asStateFlow()

    fun updateServerUrl(url: String) {
        _state.value = _state.value.copy(
            serverUrl = url,
            serverConnected = false,
            serverError = null
        )
    }

    fun checkServer() {
        val url = _state.value.serverUrl.trim()
        if (url.isBlank()) return

        _state.value = _state.value.copy(checkingServer = true, serverError = null)
        repository.configure(url)

        viewModelScope.launch {
            val healthResult = repository.health()
            if (healthResult.isSuccess) {
                val namesResult = repository.names()
                _state.value = _state.value.copy(
                    checkingServer = false,
                    serverConnected = true,
                    availableNames = namesResult.getOrDefault(emptyList())
                )
            } else {
                _state.value = _state.value.copy(
                    checkingServer = false,
                    serverError = healthResult.exceptionOrNull()?.message ?: "Connection failed"
                )
            }
        }
    }

    fun updateSelectedName(name: String) {
        _state.value = _state.value.copy(selectedName = name)
    }

    fun updateDescription(desc: String) {
        _state.value = _state.value.copy(description = desc)
    }

    fun register() {
        val s = _state.value
        _state.value = s.copy(registering = true, registerError = null)

        viewModelScope.launch {
            val result = repository.register(
                name = s.selectedName.trim().ifBlank { null },
                description = s.description.trim()
            )
            if (result.isSuccess) {
                _state.value = _state.value.copy(registering = false, registered = true)
            } else {
                _state.value = _state.value.copy(
                    registering = false,
                    registerError = result.exceptionOrNull()?.message ?: "Registration failed"
                )
            }
        }
    }
}
