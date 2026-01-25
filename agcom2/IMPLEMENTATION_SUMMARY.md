# Implementation Summary: Participant-Based Filtering & Admin User Support

**Date:** 2026-01-24
**Feature:** Email-like privacy with participant-based filtering and admin role support

## Overview

Implemented comprehensive participant-based filtering across the AgCom library to ensure users only see messages and threads they participate in, similar to email privacy. Added an admin role that bypasses all filters for system oversight.

## Changes Made

### 1. Storage Layer (`agcom/storage.py`)

#### Added `is_admin()` Helper Function
- New function to check if a handle has admin privileges
- Admin status determined by presence of `"admin"` tag in address book entry
- Cached per session for performance

#### Updated Query Functions (Made `for_handle` Required)
All query functions now require the `for_handle` parameter for authorization:

1. **`get_thread()`** (line 291)
   - Added `for_handle` required parameter
   - Checks admin status or verifies handle in `participant_handles`
   - Returns `None` if not authorized (404 behavior)

2. **`list_threads()`** (line 319)
   - Added `for_handle` required parameter
   - Admins see all threads
   - Non-admins filtered by: `participant_handles LIKE '%"handle"%'`

3. **`get_message()`** (line 404)
   - Added `for_handle` required parameter
   - Checks thread access via `get_thread()`
   - Returns `None` if thread access denied

4. **`list_messages()`** (line 435)
   - Added `for_handle` required parameter
   - When `thread_id` provided: verifies access via `get_thread()`
   - When listing all: JOINs with threads and filters by participant
   - Admins bypass all filters

5. **`search_messages()`** (line 480)
   - Added `for_handle` required parameter
   - JOINs with threads table for filtering
   - Non-admins: adds `WHERE t.participant_handles LIKE '%"handle"%'`
   - Admins see all results

### 2. Session Layer (`agcom/session.py`)

#### Added `is_admin` Property
- Property method that checks and caches admin status
- Uses `is_admin()` from storage layer
- Cached per session for performance

#### Updated All Storage Calls
Updated 13+ storage function calls to pass `self.self_identity.handle` as `for_handle`:
- `current_screen()` - line 393
- `view_thread()` - lines 439, 443
- `list_threads()` - line 485
- `list_messages()` - line 503
- `get_thread()` - lines 514, 533, 560, 273
- `get_message()` - lines 597, 268
- `search_messages()` - line 621
- `reply_thread()` - line 369

### 3. Test Updates (`agcom/tests/test_storage.py`)

Updated 6 failing storage tests to pass `for_handle` parameter:
- `test_insert_and_get_thread()` - passes "alice" as for_handle
- `test_update_thread_last_activity()` - passes "alice" as for_handle
- `test_list_threads_ordered_by_activity()` - creates admin user to see all threads
- `test_insert_and_get_message()` - passes "alice" as for_handle
- `test_list_messages_in_thread()` - passes "alice" as for_handle
- `test_search_messages()` - passes "alice" as for_handle

### 4. Documentation Updates

#### README.md
Added comprehensive "Admin User Setup" section covering:
- How admin status works (tag-based)
- Creating admin users
- Promoting existing users
- Admin capabilities
- Security considerations
- Code examples

#### Test Script (`test_filtering.py`)
Created comprehensive test script demonstrating:
- Basic participant filtering
- Admin users seeing all threads
- Non-participants getting 404 (None) on thread access
- Search filtering by participant

## Design Decisions

### Why Tag-Based Admin?
- **No schema changes needed** - uses existing `address_book.tags` field
- **Flexible** - can promote/demote users dynamically
- **Simple** - just add/remove "admin" tag
- **Auditable** - changes logged in audit trail

### Why Storage Layer Filtering?
- **Consistency** - same filtering logic everywhere (library, CLI, REST API)
- **Security** - cannot be bypassed by clever API calls
- **Performance** - database-level filtering via SQL WHERE clauses
- **Maintainability** - single source of truth

### Why `for_handle` Required?
- **Explicit authorization** - every query must specify who's asking
- **No default assumptions** - prevents accidental data leakage
- **Type safety** - required parameter catches errors at call time
- **Clean API** - no optional parameters that change behavior

## Breaking Changes

**All storage functions now require `for_handle` parameter.**

Before:
```python
threads = list_threads(conn, limit=10)
message = get_message(conn, message_id)
```

After:
```python
threads = list_threads(conn, "alice", limit=10)
message = get_message(conn, message_id, "alice")
```

**Impact:** This is a breaking change for direct storage layer usage, but the session layer API remains unchanged for end users.

## Test Results

### Library Tests
- **Total:** 129 tests
- **Passed:** 129 (100%)
- **Failed:** 0
- **Duration:** 2.68s

### Filtering Tests
- **Total:** 4 tests
- **Passed:** 4 (100%)
- **Tests:**
  1. Basic participant filtering
  2. Admin user sees everything
  3. Non-participant gets 404
  4. Search filters by participant

## Edge Cases Handled

1. **User not in thread** → `get_thread()` returns `None` → API/CLI shows 404
2. **Admin viewing any thread** → Admin check bypasses participant filter
3. **Search across threads** → Results filtered to only threads user participates in
4. **Reply to non-participant thread** → `get_message()` returns `None` → Error
5. **Empty thread list** → Users without threads see empty list, not error
6. **Admin without address book entry** → Non-admin by default (no entry = no tags)

## Performance Considerations

- **Admin check:** Single SQL query per session (cached in property)
- **Participant filtering:** Uses JSON LIKE pattern on indexed TEXT column
- **No new indexes needed:** Existing `participant_handles` column is adequate
- **Acceptable performance:** Pattern matching performs well for typical use cases

## Security Benefits

1. **Privacy by default** - users only see their own conversations
2. **Email-like behavior** - if you're not in the thread, it doesn't exist
3. **No information leakage** - 404 instead of 403 prevents thread enumeration
4. **Admin audit trail** - all admin actions logged with actor_handle
5. **Revocable privileges** - remove "admin" tag to revoke access

## Future Enhancements

Potential future improvements (not implemented):
- **Role-based access control** - multiple role tags beyond just "admin"
- **Group-based filtering** - filter by team/department tags
- **Delegation** - allow users to grant temporary access to others
- **Read receipts** - track who has viewed which messages
- **Advanced admin features** - impersonation, audit reports, bulk operations

## Usage Example

```python
from agcom import init, AgentIdentity

# Regular user - sees only their threads
with init("messages.db", AgentIdentity(handle="alice")) as session:
    threads = session.list_threads()  # Only threads alice participates in

# Admin user - sees all threads
with init("messages.db", AgentIdentity(handle="admin")) as session:
    # First, ensure admin is in address book with admin tag
    threads = session.list_threads()  # ALL threads in the system
```

## Conclusion

The implementation successfully adds email-like privacy to AgCom while maintaining backward compatibility at the session API level. All 129 existing tests pass, and the new filtering functionality works as designed. The admin role provides necessary oversight capabilities without compromising the security model.
