package com.emcom.android.ui.who

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.emcom.android.data.api.IdentityDto
import com.emcom.android.data.repository.EmcomRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class WhoUiState(
    val identities: List<IdentityDto> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null
)

class WhoViewModel(private val repository: EmcomRepository) : ViewModel() {

    private val _state = MutableStateFlow(WhoUiState())
    val state: StateFlow<WhoUiState> = _state.asStateFlow()

    init { load() }

    fun load() {
        _state.value = _state.value.copy(isLoading = true)
        viewModelScope.launch {
            val result = repository.who()
            _state.value = WhoUiState(
                identities = result.getOrDefault(emptyList()),
                isLoading = false,
                error = result.exceptionOrNull()?.message
            )
        }
    }
}
