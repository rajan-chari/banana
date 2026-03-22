package com.emcom.android.ui.inbox

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.emcom.android.data.api.EmailDto
import com.emcom.android.data.api.ThreadDto
import com.emcom.android.data.repository.EmcomRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

enum class Tab { INBOX, SENT, ALL, THREADS }

data class InboxUiState(
    val activeTab: Tab = Tab.INBOX,
    val inboxEmails: List<EmailDto> = emptyList(),
    val sentEmails: List<EmailDto> = emptyList(),
    val allEmails: List<EmailDto> = emptyList(),
    val threads: List<ThreadDto> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null
)

class InboxViewModel(private val repository: EmcomRepository) : ViewModel() {

    private val _state = MutableStateFlow(InboxUiState())
    val state: StateFlow<InboxUiState> = _state.asStateFlow()

    init {
        refresh()
    }

    fun switchTab(tab: Tab) {
        _state.value = _state.value.copy(activeTab = tab)
        refresh()
    }

    fun refresh() {
        _state.value = _state.value.copy(isLoading = true, error = null)
        viewModelScope.launch {
            when (_state.value.activeTab) {
                Tab.INBOX -> {
                    val result = repository.inbox()
                    _state.value = _state.value.copy(
                        isLoading = false,
                        inboxEmails = result.getOrDefault(emptyList()),
                        error = result.exceptionOrNull()?.message
                    )
                }
                Tab.SENT -> {
                    val result = repository.sent()
                    _state.value = _state.value.copy(
                        isLoading = false,
                        sentEmails = result.getOrDefault(emptyList()),
                        error = result.exceptionOrNull()?.message
                    )
                }
                Tab.ALL -> {
                    val result = repository.allMail()
                    _state.value = _state.value.copy(
                        isLoading = false,
                        allEmails = result.getOrDefault(emptyList()),
                        error = result.exceptionOrNull()?.message
                    )
                }
                Tab.THREADS -> {
                    val result = repository.threads()
                    _state.value = _state.value.copy(
                        isLoading = false,
                        threads = result.getOrDefault(emptyList()),
                        error = result.exceptionOrNull()?.message
                    )
                }
            }
        }
    }
}
