# Test Coverage Guide

This document explains how to use the test coverage metrics tools for the My Assist project.

## Overview

The project uses **pytest-cov** and **coverage.py** to measure test coverage across all Python packages:
- `assistant` - LLM assistant with script-to-tool promotion
- `agcom` - Multi-agent communication library
- `agcom_api` - REST API for agcom

## Quick Start

### Install Coverage Tools

```bash
# Activate virtual environment first
.venv\Scripts\activate  # Windows
source .venv/bin/activate  # Unix

# Install dev dependencies including coverage tools
pip install -e ".[dev]"

# Verify installation
pytest --version
coverage --version
```

**Important:** Coverage tools (`pytest-cov`, `coverage`) are included in the `[dev]` dependencies and are **required** for the default pytest configuration. If you get an error like "unrecognized arguments: --cov", you need to install dev dependencies.

### Run Tests with Coverage

```bash
# Run all tests with coverage (default configuration)
pytest

# Run unit tests only (faster)
pytest tests/ -m "not integration"

# Run with verbose output
pytest -v

# Run specific test file
pytest tests/test_agcom_client.py --cov=assistant.agcom
```

## Coverage Reports

### Terminal Report

By default, pytest displays coverage in the terminal:

```bash
pytest
```

**Output:**
```
---------- coverage: platform win32, python 3.10.x -----------
Name                          Stmts   Miss  Cover
-------------------------------------------------
assistant/__init__.py             5      0   100%
assistant/agcom/client.py       248     16    94%
assistant/agcom/config.py        16      0   100%
assistant/agcom/models.py        49      0   100%
-------------------------------------------------
TOTAL                           318     16    95%
```

### HTML Report

Generate interactive HTML coverage report:

```bash
pytest
# HTML report generated in htmlcov/

# Open in browser (Windows)
start htmlcov/index.html

# Open in browser (Linux/Mac)
open htmlcov/index.html
# or
xdg-open htmlcov/index.html
```

The HTML report shows:
- ✅ Line-by-line coverage with color coding
- 🔍 Missing lines highlighted in red
- 📊 Coverage percentages per file
- 🌳 Package hierarchy view

### JSON Report

Generate machine-readable JSON report:

```bash
pytest
# JSON report generated in coverage.json

# View with jq (if installed)
jq '.totals' coverage.json
```

**Output:**
```json
{
  "covered_lines": 302,
  "num_statements": 318,
  "percent_covered": 95.0,
  "missing_lines": 16,
  "excluded_lines": 0
}
```

## Coverage Configuration

Coverage settings are in `pyproject.toml`:

### [tool.coverage.run]
- **source**: Packages to measure (`assistant`, `agcom`, `agcom_api`)
- **omit**: Files to exclude (tests, caches, venv)
- **branch**: Enable branch coverage (not just line coverage)
- **parallel**: Support parallel test execution

### [tool.coverage.report]
- **precision**: Decimal places (2)
- **show_missing**: Show line numbers for uncovered code
- **skip_empty**: Don't show files with no code
- **sort**: Sort by coverage percentage

### [tool.pytest.ini_options]
Default pytest arguments include coverage:
```toml
addopts = "--cov=assistant --cov=agcom --cov=agcom_api --cov-report=html --cov-report=term --cov-report=json"
```

## Advanced Usage

### Coverage for Specific Package

```bash
# Only measure assistant package
pytest --cov=assistant --cov-report=html

# Only measure agcom client
pytest tests/test_agcom_client.py --cov=assistant.agcom.client
```

### Minimum Coverage Threshold

Fail tests if coverage drops below threshold:

```bash
# Fail if coverage < 80%
pytest --cov-fail-under=80

# Fail if coverage < 90%
pytest --cov-fail-under=90
```

### Coverage Without Running Tests

View coverage from previous test run:

```bash
# Generate report from .coverage data
coverage report

# Generate HTML report
coverage html

# Generate JSON report
coverage json
```

### Combine Coverage from Multiple Runs

```bash
# Run tests in parallel (generates .coverage.* files)
pytest -n auto --cov=assistant --cov-append

# Combine all coverage data
coverage combine

# Generate combined report
coverage report
coverage html
```

## Coverage Targets

### Current Coverage (as of 2026-01-25)

| Package | Coverage | Status |
|---------|----------|--------|
| **assistant.agcom** | 77% | ⚠️ Good |
| - client.py | 94% | ✅ Excellent |
| - config.py | 100% | ✅ Perfect |
| - models.py | 100% | ✅ Perfect |
| - tools.py | 33% | ❌ Needs work |
| **assistant.bot** | ~60% | ⚠️ Fair |
| **assistant.llm** | ~70% | ⚠️ Good |
| **agcom** | ~80% | ✅ Good |
| **agcom_api** | ~85% | ✅ Good |

### Coverage Goals

- 🎯 **Minimum**: 70% overall coverage
- 🎯 **Target**: 80% overall coverage
- 🎯 **Stretch**: 90% overall coverage
- 🎯 **Critical paths**: 95%+ coverage

### What to Test

**High Priority (aim for 95%+):**
- Core business logic
- Error handling
- Authentication/authorization
- Data validation
- API endpoints

**Medium Priority (aim for 80%+):**
- Configuration parsing
- Data models
- Utilities
- CLI commands

**Low Priority (aim for 60%+):**
- UI/presentation code
- Logging statements
- Development tools

## Understanding Coverage Metrics

### Line Coverage
Percentage of code lines executed during tests.

```python
def example(x):
    if x > 0:           # ✅ Covered
        return "positive"  # ✅ Covered
    else:
        return "negative"  # ❌ Not covered (test never passes x <= 0)
```

**Line coverage: 75%** (3 of 4 lines)

### Branch Coverage
Percentage of decision branches tested (if/else, try/except, etc.).

```python
def example(x):
    if x > 0:           # Branch 1: True ✅, False ❌
        return "positive"
    else:
        return "negative"
```

**Branch coverage: 50%** (1 of 2 branches)

### Statement Coverage
Similar to line coverage but counts statements (not physical lines).

```python
result = func1() if condition else func2()  # 1 line, 2 statements
```

## Improving Coverage

### Find Uncovered Code

```bash
# Show missing lines
pytest --cov-report=term-missing

# Generate HTML report with highlighted missing lines
pytest --cov-report=html
```

### Write Tests for Uncovered Code

1. **Identify gaps**: Check HTML report for red lines
2. **Add test cases**: Write tests that execute those lines
3. **Verify**: Re-run coverage to confirm improvement

Example:
```python
# Uncovered error handling
def send_message(handle):
    if not handle:
        raise ValueError("Handle required")  # ❌ Not covered
    # ...

# Add test
def test_send_message_without_handle():
    with pytest.raises(ValueError):
        send_message("")  # ✅ Now covered
```

### Exclude Unreachable Code

Mark code that shouldn't be covered:

```python
def example():
    if TYPE_CHECKING:  # pragma: no cover
        from typing import Protocol  # Only runs during type checking

    if __name__ == "__main__":  # pragma: no cover
        main()  # Only runs as script
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Run tests with coverage
  run: |
    pytest --cov-report=xml

- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v3
  with:
    file: ./coverage.xml
```

### GitLab CI

```yaml
test:
  script:
    - pytest --cov-report=term --cov-report=xml
  coverage: '/TOTAL.*\s+(\d+)%/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage.xml
```

### Pre-commit Hook

Enforce minimum coverage before commit:

```bash
# .git/hooks/pre-commit
#!/bin/bash
pytest --cov-fail-under=80 -q
if [ $? -ne 0 ]; then
    echo "❌ Coverage below 80%. Commit rejected."
    exit 1
fi
```

## Troubleshooting

### "Unrecognized arguments: --cov" Error

**Problem:** `pytest` fails with error about unrecognized arguments `--cov`

**Cause:** Coverage tools (`pytest-cov`) not installed in virtual environment

**Solution:**
```bash
# Make sure virtual environment is activated
.venv\Scripts\activate  # Windows
source .venv/bin/activate  # Unix

# Install dev dependencies
pip install -e ".[dev]"

# Verify pytest-cov is installed
pip list | grep pytest-cov  # Unix
pip list | findstr pytest-cov  # Windows

# Now pytest should work
pytest
```

**Alternative:** Run tests without coverage:
```bash
pytest --no-cov
```

### Coverage Data Not Found

**Problem:** `coverage report` shows "No data to report"

**Solution:**
```bash
# Delete old coverage data
rm .coverage .coverage.*

# Run tests again
pytest
```

### Coverage Too Low

**Problem:** Coverage dropped unexpectedly

**Possible causes:**
1. New untested code added
2. Existing tests disabled/skipped
3. Coverage configuration changed

**Solution:**
```bash
# Find what's not covered
pytest --cov-report=term-missing

# Check git diff for new code
git diff --stat
```

### Tests Pass But Coverage Fails

**Problem:** Tests pass but `pytest --cov-fail-under=80` fails

**Solution:**
This is expected! Coverage threshold ensures test quality.

```bash
# Identify gaps
pytest --cov-report=html

# Add tests for uncovered code
# Re-run until threshold met
```

### HTML Report Not Generated

**Problem:** `htmlcov/` directory doesn't exist

**Solution:**
```bash
# Ensure HTML report is enabled
pytest --cov-report=html

# Or use coverage command directly
coverage html
```

## Best Practices

### ✅ DO

- Run coverage locally before pushing
- Aim for 80%+ on new code
- Test error paths, not just happy paths
- Review HTML report for gaps
- Use branch coverage, not just line coverage
- Exclude irrelevant code (`pragma: no cover`)

### ❌ DON'T

- Don't aim for 100% coverage everywhere (diminishing returns)
- Don't test implementation details
- Don't write tests just to increase coverage
- Don't skip important tests to meet time deadlines
- Don't ignore low coverage warnings

## Resources

- [pytest-cov documentation](https://pytest-cov.readthedocs.io/)
- [coverage.py documentation](https://coverage.readthedocs.io/)
- [pytest documentation](https://docs.pytest.org/)

## Quick Reference

| Command | Description |
|---------|-------------|
| `pytest` | Run tests with default coverage |
| `pytest --cov-report=html` | Generate HTML report |
| `pytest --cov-report=term-missing` | Show missing lines |
| `pytest --cov-fail-under=80` | Fail if coverage < 80% |
| `pytest -m "not integration"` | Unit tests only |
| `coverage report` | Show terminal report |
| `coverage html` | Generate HTML report |
| `coverage json` | Generate JSON report |
| `start htmlcov/index.html` | Open HTML report (Windows) |

---

**Last updated:** 2026-01-25
**Coverage goal:** 80%+ overall, 95%+ on critical paths
**Current status:** 77% overall (agcom integration), tracking to 80%+
