package com.emcom.android.ui.thread

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.emcom.android.data.api.EmailDto
import com.emcom.android.data.repository.EmcomRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ThreadUiState(
    val emails: List<EmailDto> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null
)

class ThreadViewModel(
    private val repository: EmcomRepository,
    private val threadId: String
) : ViewModel() {

    private val _state = MutableStateFlow(ThreadUiState())
    val state: StateFlow<ThreadUiState> = _state.asStateFlow()

    init { load() }

    fun load() {
        _state.value = _state.value.copy(isLoading = true)
        viewModelScope.launch {
            val result = repository.getThread(threadId)
            _state.value = ThreadUiState(
                emails = result.getOrDefault(emptyList()),
                isLoading = false,
                error = result.exceptionOrNull()?.message
            )
        }
    }

    /** Reply to the last email in the thread */
    fun lastEmailId(): String? = _state.value.emails.lastOrNull()?.id
}
