"""Tests for agcom validation functions."""

import pytest

from agcom.validation import (
    validate_body,
    validate_handle,
    validate_recipients,
    validate_subject,
    validate_tag,
)


class TestValidateHandle:
    def test_valid_simple(self):
        assert validate_handle("alice") == "alice"

    def test_valid_with_underscore(self):
        assert validate_handle("alice_bot") == "alice_bot"

    def test_valid_with_hyphen(self):
        assert validate_handle("alice-bot") == "alice-bot"

    def test_valid_with_numbers(self):
        assert validate_handle("agent007") == "agent007"

    def test_valid_single_char(self):
        assert validate_handle("a") == "a"

    def test_valid_max_length(self):
        handle = "a" * 50
        assert validate_handle(handle) == handle

    def test_invalid_empty(self):
        with pytest.raises(ValueError, match="non-empty"):
            validate_handle("")

    def test_invalid_none(self):
        with pytest.raises(ValueError, match="non-empty"):
            validate_handle(None)  # type: ignore

    def test_invalid_uppercase(self):
        with pytest.raises(ValueError, match="Invalid handle"):
            validate_handle("Alice")

    def test_invalid_spaces(self):
        with pytest.raises(ValueError, match="Invalid handle"):
            validate_handle("alice bot")

    def test_invalid_too_long(self):
        with pytest.raises(ValueError, match="Invalid handle"):
            validate_handle("a" * 51)

    def test_invalid_starts_with_underscore(self):
        with pytest.raises(ValueError, match="Invalid handle"):
            validate_handle("_alice")

    def test_invalid_starts_with_hyphen(self):
        with pytest.raises(ValueError, match="Invalid handle"):
            validate_handle("-alice")

    def test_invalid_special_chars(self):
        with pytest.raises(ValueError, match="Invalid handle"):
            validate_handle("alice@bot")


class TestValidateSubject:
    def test_valid(self):
        assert validate_subject("Hello World") == "Hello World"

    def test_strips_whitespace(self):
        assert validate_subject("  Hello  ") == "Hello"

    def test_valid_max_length(self):
        subject = "a" * 200
        assert validate_subject(subject) == subject

    def test_invalid_empty(self):
        with pytest.raises(ValueError, match="empty"):
            validate_subject("")

    def test_invalid_whitespace_only(self):
        with pytest.raises(ValueError, match="empty"):
            validate_subject("   ")

    def test_invalid_too_long(self):
        with pytest.raises(ValueError, match="too long"):
            validate_subject("a" * 201)

    def test_invalid_not_string(self):
        with pytest.raises(ValueError, match="string"):
            validate_subject(123)  # type: ignore


class TestValidateBody:
    def test_valid(self):
        assert validate_body("Hello World") == "Hello World"

    def test_strips_whitespace(self):
        assert validate_body("  Hello  ") == "Hello"

    def test_valid_max_length(self):
        body = "a" * 10000
        assert validate_body(body) == body

    def test_invalid_empty(self):
        with pytest.raises(ValueError, match="empty"):
            validate_body("")

    def test_invalid_whitespace_only(self):
        with pytest.raises(ValueError, match="empty"):
            validate_body("   ")

    def test_invalid_too_long(self):
        with pytest.raises(ValueError, match="too long"):
            validate_body("a" * 10001)


class TestValidateTag:
    def test_valid_simple(self):
        assert validate_tag("urgent") == "urgent"

    def test_valid_with_underscore(self):
        assert validate_tag("high_priority") == "high_priority"

    def test_valid_with_hyphen(self):
        assert validate_tag("high-priority") == "high-priority"

    def test_invalid_empty(self):
        with pytest.raises(ValueError, match="non-empty"):
            validate_tag("")

    def test_invalid_uppercase(self):
        with pytest.raises(ValueError, match="Invalid tag"):
            validate_tag("Urgent")

    def test_invalid_spaces(self):
        with pytest.raises(ValueError, match="Invalid tag"):
            validate_tag("high priority")

    def test_invalid_too_long(self):
        with pytest.raises(ValueError, match="Invalid tag"):
            validate_tag("a" * 51)


class TestValidateRecipients:
    def test_valid_single(self):
        assert validate_recipients(["alice"]) == ["alice"]

    def test_valid_multiple(self):
        assert validate_recipients(["alice", "bob"]) == ["alice", "bob"]

    def test_invalid_empty_list(self):
        with pytest.raises(ValueError, match="non-empty"):
            validate_recipients([])

    def test_invalid_none(self):
        with pytest.raises(ValueError, match="non-empty"):
            validate_recipients(None)  # type: ignore

    def test_invalid_duplicate(self):
        with pytest.raises(ValueError, match="Duplicate"):
            validate_recipients(["alice", "alice"])

    def test_invalid_handle_in_list(self):
        with pytest.raises(ValueError, match="Invalid handle"):
            validate_recipients(["alice", "Bob"])
