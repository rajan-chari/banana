"""Tests for validation functions."""

import pytest
from agcom.validation import (
    validate_handle,
    validate_subject,
    validate_body,
    validate_tags,
    validate_description,
    validate_display_name,
)


class TestValidateHandle:
    """Tests for handle validation."""

    def test_valid_handles(self):
        """Test valid handle formats."""
        validate_handle("alice")
        validate_handle("bob123")
        validate_handle("agent_007")
        validate_handle("test-agent")
        validate_handle("agent.1")  # Periods allowed
        validate_handle("team.lead")  # Periods allowed
        validate_handle("ab")  # Min length 2
        validate_handle("a" * 64)  # Max length

    def test_empty_handle(self):
        """Test empty handle raises error."""
        with pytest.raises(ValueError, match="cannot be empty"):
            validate_handle("")

    def test_whitespace_only_handle(self):
        """Test whitespace-only handle raises error."""
        with pytest.raises(ValueError, match="cannot be empty"):
            validate_handle("   ")

    def test_uppercase_handle(self):
        """Test uppercase letters raise error."""
        with pytest.raises(ValueError, match="lowercase"):
            validate_handle("Alice")

    def test_special_chars_handle(self):
        """Test special characters raise error."""
        with pytest.raises(ValueError, match="lowercase"):
            validate_handle("alice@example")

    def test_too_short_handle(self):
        """Test handle below min length raises error."""
        with pytest.raises(ValueError, match="at least 2 characters"):
            validate_handle("a")

    def test_too_long_handle(self):
        """Test handle exceeding max length raises error."""
        with pytest.raises(ValueError, match="64 characters"):
            validate_handle("a" * 65)

    def test_handle_starts_with_period(self):
        """Test handle starting with period raises error."""
        with pytest.raises(ValueError, match="cannot start or end"):
            validate_handle(".alice")

    def test_handle_ends_with_period(self):
        """Test handle ending with period raises error."""
        with pytest.raises(ValueError, match="cannot start or end"):
            validate_handle("alice.")

    def test_handle_starts_with_hyphen(self):
        """Test handle starting with hyphen raises error."""
        with pytest.raises(ValueError, match="cannot start or end"):
            validate_handle("-alice")

    def test_handle_ends_with_hyphen(self):
        """Test handle ending with hyphen raises error."""
        with pytest.raises(ValueError, match="cannot start or end"):
            validate_handle("alice-")


class TestValidateSubject:
    """Tests for subject validation."""

    def test_valid_subjects(self):
        """Test valid subject formats."""
        validate_subject("Hello")
        validate_subject("Project discussion")
        validate_subject("a" * 200)  # Max length

    def test_empty_subject(self):
        """Test empty subject raises error."""
        with pytest.raises(ValueError, match="cannot be empty"):
            validate_subject("")

    def test_whitespace_only_subject(self):
        """Test whitespace-only subject raises error."""
        with pytest.raises(ValueError, match="cannot be empty"):
            validate_subject("   ")

    def test_too_long_subject(self):
        """Test subject exceeding max length raises error."""
        with pytest.raises(ValueError, match="200 characters"):
            validate_subject("a" * 201)


class TestValidateBody:
    """Tests for body validation."""

    def test_valid_bodies(self):
        """Test valid body formats."""
        validate_body("Hello world")
        validate_body("Multi\nline\nbody")
        validate_body("a" * 50000)  # Max length

    def test_empty_body(self):
        """Test empty body raises error."""
        with pytest.raises(ValueError, match="cannot be empty"):
            validate_body("")

    def test_whitespace_only_body(self):
        """Test whitespace-only body raises error."""
        with pytest.raises(ValueError, match="cannot be empty"):
            validate_body("   ")

    def test_too_long_body(self):
        """Test body exceeding max length raises error."""
        with pytest.raises(ValueError, match="50,000 characters"):
            validate_body("a" * 50001)


class TestValidateTags:
    """Tests for tags validation."""

    def test_valid_tags(self):
        """Test valid tag formats."""
        result = validate_tags(["urgent", "project"])
        assert result == ["urgent", "project"]
        result = validate_tags(["a" * 30])  # Max length
        assert result == ["a" * 30]

    def test_tag_deduplication(self):
        """Test that duplicate tags are removed."""
        result = validate_tags(["urgent", "project", "urgent"])
        assert result == ["urgent", "project"]

    def test_tag_format_validation(self):
        """Test that tags must be lowercase alphanumeric with hyphens/underscores."""
        with pytest.raises(ValueError, match="lowercase letters"):
            validate_tags(["Urgent"])  # Uppercase not allowed
        with pytest.raises(ValueError, match="lowercase letters"):
            validate_tags(["urgent project"])  # Spaces not allowed
        with pytest.raises(ValueError, match="lowercase letters"):
            validate_tags(["urgent!"])  # Special chars not allowed

    def test_max_tags_limit(self):
        """Test that maximum 20 tags are allowed."""
        with pytest.raises(ValueError, match="exceed 20 tags"):
            validate_tags(["tag" + str(i) for i in range(21)])

    def test_empty_tag(self):
        """Test empty tag raises error."""
        with pytest.raises(ValueError, match="cannot be empty"):
            validate_tags(["urgent", ""])

    def test_whitespace_only_tag(self):
        """Test whitespace-only tag raises error."""
        with pytest.raises(ValueError, match="cannot be empty"):
            validate_tags(["urgent", "   "])

    def test_too_long_tag(self):
        """Test tag exceeding max length raises error."""
        with pytest.raises(ValueError, match="1-30 characters"):
            validate_tags(["a" * 31])


class TestValidateDescription:
    """Tests for description validation."""

    def test_valid_descriptions(self):
        """Test valid description formats."""
        validate_description("Data analyst")
        validate_description("a" * 500)  # Max length

    def test_empty_description(self):
        """Test empty description raises error."""
        with pytest.raises(ValueError, match="cannot be empty"):
            validate_description("")

    def test_whitespace_only_description(self):
        """Test whitespace-only description raises error."""
        with pytest.raises(ValueError, match="cannot be empty"):
            validate_description("   ")

    def test_too_long_description(self):
        """Test description exceeding max length raises error."""
        with pytest.raises(ValueError, match="500 characters"):
            validate_description("a" * 501)


class TestValidateDisplayName:
    """Tests for display name validation."""

    def test_valid_display_names(self):
        """Test valid display name formats."""
        validate_display_name("Alice Smith")
        validate_display_name("a" * 100)  # Max length

    def test_empty_display_name(self):
        """Test empty display name raises error."""
        with pytest.raises(ValueError, match="cannot be empty"):
            validate_display_name("")

    def test_whitespace_only_display_name(self):
        """Test whitespace-only display name raises error."""
        with pytest.raises(ValueError, match="cannot be empty"):
            validate_display_name("   ")

    def test_too_long_display_name(self):
        """Test display name exceeding max length raises error."""
        with pytest.raises(ValueError, match="100 characters"):
            validate_display_name("a" * 101)
