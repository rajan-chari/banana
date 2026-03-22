package com.emcom.android.ui.compose

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.emcom.android.data.api.EmailDto
import com.emcom.android.data.repository.EmcomRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ComposeUiState(
    val to: String = "",
    val subject: String = "",
    val body: String = "",
    val replyToEmail: EmailDto? = null,
    val sending: Boolean = false,
    val sent: Boolean = false,
    val error: String? = null
)

class ComposeViewModel(
    private val repository: EmcomRepository,
    private val replyToId: String? = null
) : ViewModel() {

    private val _state = MutableStateFlow(ComposeUiState())
    val state: StateFlow<ComposeUiState> = _state.asStateFlow()

    init {
        if (replyToId != null) {
            loadReplyTo()
        }
    }

    private fun loadReplyTo() {
        viewModelScope.launch {
            val result = repository.getEmail(replyToId!!)
            result.getOrNull()?.let { original ->
                _state.value = _state.value.copy(
                    replyToEmail = original,
                    to = buildReplyRecipients(original),
                    subject = if (original.subject.startsWith("Re: ")) original.subject
                              else "Re: ${original.subject}"
                )
            }
        }
    }

    private fun buildReplyRecipients(original: EmailDto): String {
        // Replicate Python client: sender + to + cc - self
        // We don't know self here easily, but repository.reply() handles it
        // For the UI, just show who we're replying to
        return (listOf(original.sender) + original.to + original.cc)
            .distinct()
            .joinToString(", ")
    }

    fun updateTo(value: String) { _state.value = _state.value.copy(to = value) }
    fun updateSubject(value: String) { _state.value = _state.value.copy(subject = value) }
    fun updateBody(value: String) { _state.value = _state.value.copy(body = value) }

    fun send() {
        val s = _state.value
        if (s.to.isBlank()) {
            _state.value = s.copy(error = "Recipients required")
            return
        }

        _state.value = s.copy(sending = true, error = null)
        viewModelScope.launch {
            val result = if (replyToId != null) {
                repository.reply(replyToId, s.body)
            } else {
                val recipients = s.to.split(",", ";").map { it.trim() }.filter { it.isNotBlank() }
                repository.sendEmail(
                    to = recipients,
                    subject = s.subject,
                    body = s.body
                )
            }

            if (result.isSuccess) {
                _state.value = _state.value.copy(sending = false, sent = true)
            } else {
                _state.value = _state.value.copy(
                    sending = false,
                    error = result.exceptionOrNull()?.message ?: "Send failed"
                )
            }
        }
    }
}
