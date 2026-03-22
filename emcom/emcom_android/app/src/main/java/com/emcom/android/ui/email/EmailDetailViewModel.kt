package com.emcom.android.ui.email

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.emcom.android.data.api.EmailDto
import com.emcom.android.data.repository.EmcomRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class EmailDetailUiState(
    val email: EmailDto? = null,
    val isLoading: Boolean = true,
    val error: String? = null,
    val actionMessage: String? = null
)

class EmailDetailViewModel(
    private val repository: EmcomRepository,
    private val emailId: String
) : ViewModel() {

    private val _state = MutableStateFlow(EmailDetailUiState())
    val state: StateFlow<EmailDetailUiState> = _state.asStateFlow()

    init {
        loadEmail()
    }

    private fun loadEmail() {
        viewModelScope.launch {
            // Reading marks as read server-side (removes unread tag)
            val result = repository.getEmail(emailId)
            _state.value = EmailDetailUiState(
                email = result.getOrNull(),
                isLoading = false,
                error = result.exceptionOrNull()?.message
            )
        }
    }

    fun markHandled() {
        viewModelScope.launch {
            repository.addTags(emailId, listOf("handled"))
            _state.value = _state.value.copy(actionMessage = "Marked as handled")
            loadEmail()
        }
    }

    fun removeTag(tag: String) {
        viewModelScope.launch {
            repository.removeTag(emailId, tag)
            loadEmail()
        }
    }

    fun clearActionMessage() {
        _state.value = _state.value.copy(actionMessage = null)
    }
}
