#!/usr/bin/env python3
"""
Convenience script to run tests with coverage and generate reports.

Usage:
    python run_coverage.py              # Run all tests with coverage
    python run_coverage.py --unit       # Unit tests only
    python run_coverage.py --integration # Integration tests only
    python run_coverage.py --min 80     # Fail if coverage < 80%
    python run_coverage.py --html-only  # Just generate HTML from existing data
    python run_coverage.py --package assistant.agcom  # Specific package
"""

import argparse
import subprocess
import sys
import webbrowser
from pathlib import Path


def run_command(cmd: list[str], description: str) -> int:
    """Run a command and return exit code."""
    print(f"\n{'=' * 70}")
    print(f"🔧 {description}")
    print(f"{'=' * 70}")
    print(f"Running: {' '.join(cmd)}\n")

    result = subprocess.run(cmd, cwd=Path(__file__).parent)

    if result.returncode == 0:
        print(f"\n✅ {description} - SUCCESS")
    else:
        print(f"\n❌ {description} - FAILED")

    return result.returncode


def open_html_report():
    """Open HTML coverage report in default browser."""
    html_file = Path(__file__).parent / "htmlcov" / "index.html"

    if html_file.exists():
        print(f"\n📊 Opening coverage report: {html_file}")
        webbrowser.open(f"file://{html_file}")
    else:
        print(f"\n⚠️  HTML report not found: {html_file}")
        print("Run tests with coverage first: pytest")


def main():
    parser = argparse.ArgumentParser(
        description="Run tests with coverage and generate reports",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python run_coverage.py
    python run_coverage.py --unit --min 80
    python run_coverage.py --package assistant.agcom
    python run_coverage.py --html-only --open
        """
    )

    parser.add_argument(
        "--unit",
        action="store_true",
        help="Run unit tests only (exclude integration tests)"
    )

    parser.add_argument(
        "--integration",
        action="store_true",
        help="Run integration tests only"
    )

    parser.add_argument(
        "--package",
        type=str,
        help="Measure coverage for specific package (e.g., assistant.agcom)"
    )

    parser.add_argument(
        "--min",
        type=int,
        metavar="PCT",
        help="Fail if coverage below this percentage (e.g., 80)"
    )

    parser.add_argument(
        "--html-only",
        action="store_true",
        help="Skip tests, just generate HTML report from existing data"
    )

    parser.add_argument(
        "--open",
        action="store_true",
        help="Open HTML report in browser after generation"
    )

    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Verbose test output"
    )

    args = parser.parse_args()

    # Just generate HTML report
    if args.html_only:
        exit_code = run_command(
            ["coverage", "html"],
            "Generating HTML coverage report"
        )

        if exit_code == 0 and args.open:
            open_html_report()

        return exit_code

    # Build pytest command
    pytest_cmd = ["pytest"]

    # Test selection
    if args.unit:
        pytest_cmd.extend(["-m", "not integration"])
    elif args.integration:
        pytest_cmd.extend(["-m", "integration"])

    # Verbose output
    if args.verbose:
        pytest_cmd.append("-v")

    # Coverage for specific package
    if args.package:
        pytest_cmd.append(f"--cov={args.package}")
        # Remove default coverage args (they're in pyproject.toml)
        pytest_cmd.append("--no-cov-on-fail")

    # Minimum coverage threshold
    if args.min:
        pytest_cmd.append(f"--cov-fail-under={args.min}")

    # Run tests with coverage
    exit_code = run_command(
        pytest_cmd,
        f"Running {'unit' if args.unit else 'integration' if args.integration else 'all'} tests with coverage"
    )

    # Print summary
    print(f"\n{'=' * 70}")
    print("📊 COVERAGE SUMMARY")
    print(f"{'=' * 70}\n")

    # Show detailed report
    subprocess.run(["coverage", "report", "--skip-covered"])

    # Show paths to reports
    print(f"\n{'=' * 70}")
    print("📄 GENERATED REPORTS")
    print(f"{'=' * 70}")

    html_path = Path(__file__).parent / "htmlcov" / "index.html"
    json_path = Path(__file__).parent / "coverage.json"

    if html_path.exists():
        print(f"✅ HTML Report: {html_path}")
    if json_path.exists():
        print(f"✅ JSON Report: {json_path}")

    # Open HTML report if requested
    if args.open and exit_code == 0:
        open_html_report()
    elif args.open:
        print("\n⚠️  Skipping browser open due to test failures")

    # Print instructions
    if not args.open:
        print(f"\n💡 TIP: Use --open flag to automatically open HTML report")
        print(f"   Or open manually: start {html_path}")

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
