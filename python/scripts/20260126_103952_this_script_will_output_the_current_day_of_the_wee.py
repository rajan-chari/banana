"""
Generated: 2026-01-26T10:39:52.892188
Description: This script will output the current day of the week.
"""
from datetime import datetime

# Get current day of the week
current_day = datetime.now().strftime('%A')
print(current_day)