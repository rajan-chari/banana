package com.emcom.android.ui.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.emcom.android.data.api.EmailDto
import com.emcom.android.data.repository.EmcomRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class SearchUiState(
    val from: String = "",
    val to: String = "",
    val subject: String = "",
    val body: String = "",
    val tag: String = "",
    val results: List<EmailDto>? = null,
    val isSearching: Boolean = false,
    val error: String? = null
)

class SearchViewModel(private val repository: EmcomRepository) : ViewModel() {

    private val _state = MutableStateFlow(SearchUiState())
    val state: StateFlow<SearchUiState> = _state.asStateFlow()

    fun updateFrom(v: String) { _state.value = _state.value.copy(from = v) }
    fun updateTo(v: String) { _state.value = _state.value.copy(to = v) }
    fun updateSubject(v: String) { _state.value = _state.value.copy(subject = v) }
    fun updateBody(v: String) { _state.value = _state.value.copy(body = v) }
    fun updateTag(v: String) { _state.value = _state.value.copy(tag = v) }

    fun search() {
        val s = _state.value
        _state.value = s.copy(isSearching = true, error = null)
        viewModelScope.launch {
            val result = repository.search(
                from = s.from.ifBlank { null },
                to = s.to.ifBlank { null },
                subject = s.subject.ifBlank { null },
                body = s.body.ifBlank { null },
                tag = s.tag.ifBlank { null }
            )
            _state.value = _state.value.copy(
                isSearching = false,
                results = result.getOrNull(),
                error = result.exceptionOrNull()?.message
            )
        }
    }
}
