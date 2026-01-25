# Changelog

All notable changes to the agcom console will be documented here.

## [Recent Improvements] - 2026-01-25

### Major Features

#### 1. Config File Support
- **Auto-save on init**: `agcom init --store db.db --me alice` now saves config automatically
- **Config management**: New `config` commands to set/show/clear defaults
- **Environment variables**: Support for `AGCOM_STORE` and `AGCOM_ME`
- **Priority**: CLI flags > ENV vars > config file
- **Platform-specific paths**:
  - Windows: `%APPDATA%\agcom\config.json`
  - macOS: `~/Library/Application Support/agcom/config.json`
  - Linux: `~/.config/agcom/config.json`

**Before:**
```bash
agcom --store mydb.db --me alice send bob "Hi" "Hello"
agcom --store mydb.db --me alice screen
agcom --store mydb.db --me alice view 01KFV...
```

**After:**
```bash
agcom init --store mydb.db --me alice  # One time
agcom send bob "Hi" "Hello"
agcom screen
agcom view 1
```

#### 2. Numbered Indices
- **Screen view**: Threads numbered 1, 2, 3...
- **Thread view**: Messages numbered [1], [2], [3]...
- **Quick access**: `view 1`, `reply 1` instead of copying ULIDs
- **Persistence**: Indices cached between commands via `~/.agcom/index_cache.json`

**Before:**
```bash
agcom view 01KFV9RKBB4PXSQZPXE3W260NE
agcom reply 01KFV9RKZPSEBBGAFZ722HMAMG --body "Thanks"
```

**After:**
```bash
agcom screen     # Shows: 1, 2, 3...
agcom view 1     # View thread #1
agcom reply 1 "Thanks"  # Reply to message #1
```

#### 3. Simplified Send Syntax
- **Positional arguments**: No need for `--subject` and `--body` flags
- **Backward compatible**: Flag syntax still works

**Before:**
```bash
agcom send alice --subject "Test" --body "Hello"
```

**After:**
```bash
agcom send alice "Test" "Hello"
agcom send alice bob charlie "Group message" "Hey everyone"
```

#### 4. Improved Init Workflow
- **Admin by default**: First user is admin automatically
- **Config auto-save**: No separate config step needed
- **Display name**: Optional `--display-name` flag
- **Opt-out**: Use `--no-admin` if you don't want admin

**Before:**
```bash
agcom --store db.db --me alice init --as-admin
agcom config set --store db.db --me alice
```

**After:**
```bash
agcom init --store db.db --me alice
# Creates DB, adds as admin, saves config
```

#### 5. Admin Management
- **Add admin**: `agcom ab add bob --admin`
- **Promote**: `agcom ab edit charlie --admin`
- **Demote**: `agcom ab edit charlie --no-admin`
- **Visual badges**: Admin users show `[ADMIN]` badge in listings

#### 6. Enhanced Formatting
- **Colors**: Syntax highlighting for better readability
- **Relative timestamps**: "just now", "2h ago", "3d ago"
- **Smart truncation**: Long text breaks at word boundaries
- **Text wrapping**: Messages wrap at 76 characters with indentation
- **Unicode support**: Bullets (•), arrows (→), indicators (●) with ASCII fallback
- **Status indicators**: Visual active/inactive status
- **Cross-platform**: Works on Windows, macOS, Linux

**Features:**
- Thread count in headers: "INBOX (5 threads)"
- Sender highlighting: Your messages in cyan
- Admin badges: Yellow [ADMIN] tags
- Dimmed metadata: IDs and timestamps
- Better spacing: Cleaner table layouts
- Reply indicators: '-> in reply to message

#### 7. Improved Reply Command
- **Simple syntax**: `reply 1 "message"` instead of flags
- **Mixed mode**: Can use flags or positional args
- **Index support**: Works with message numbers

**Before:**
```bash
agcom reply 01KFV9RKZPSEBBGAFZ722HMAMG --body "Thanks"
```

**After:**
```bash
agcom reply 1 "Thanks"
agcom reply 1 --body "Thanks"  # Both work
```

### User Experience Improvements

#### Better Help
- Updated help text with examples
- Clear syntax notes
- Common workflow guide
- Admin management section

#### Error Messages
- More helpful error messages
- Suggestions for fixes
- Shows alternative syntax

#### Messy Data Handling
- Long handles truncate gracefully
- Long subjects break at words
- Long descriptions wrap with indentation
- Control characters sanitized
- Empty fields handled cleanly

### Technical Improvements

#### New Modules
- `agcom/console/config.py` - Config file management
- `agcom/console/formatting.py` - Enhanced output formatting

#### Index Caching
- Thread indices cached to `~/.agcom/index_cache.json`
- Persists across command invocations
- Auto-updates when viewing screen/threads

#### Color Support
- Auto-detects terminal capabilities
- Respects `NO_COLOR` environment variable
- Falls back to plain text when needed

#### Unicode Handling
- Detects encoding support
- Graceful fallback to ASCII
- Works in limited Windows terminals

### Breaking Changes

**None** - All changes are backward compatible. Old syntax still works:
```bash
# Still works
agcom --store db.db --me alice screen
agcom send bob --subject "Test" --body "Hello"
agcom reply 01KFV... --body "Thanks"
```

### Migration Guide

No migration needed! Just start using the new features:

```bash
# If you have existing databases, just add config
agcom config set --store existing.db --me yourhandle

# Or reinitialize (preserves existing data)
agcom init --store existing.db --me yourhandle

# Start using new syntax
agcom screen
agcom view 1
agcom reply 1 "Hi!"
```

### Performance

- **Faster startup**: Config loaded once
- **Less typing**: Shorter commands
- **Fewer errors**: Index-based access
- **Better UX**: Relative timestamps, smart formatting

### Accessibility

- `NO_COLOR` support for screen readers
- ASCII fallback for limited terminals
- Clear visual hierarchy
- Consistent formatting

## Future Enhancements

Potential future improvements:
- Command aliases (`s` for send, `r` for reply)
- Compact listing modes (`--compact`)
- Filtering (`screen --unread`, `screen --from alice`)
- Read/unread tracking
- Draft support
- Notification on new messages
- Tab completion
- Pagination for long lists
- Export/backup commands
- Forward messages
- Bulk operations

## Credits

Improvements designed for better user experience and productivity.
