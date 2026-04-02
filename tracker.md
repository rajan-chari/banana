# Tracker
Last updated: 2026-03-31

## In Motion
| Item | Status | Owner | Notes/Links |
|------|--------|-------|-------------|
| pty-win server restart | Rajan | Cost regex, merged dashboard, unfocused border, hook revert, checkpoint prompts |
| Next pty-win item | Not started | milo→moss | Waiting for new requests |
| Phase 8: Polish & Hardening | Not started | milo | Error handling, logging, docs, testing |

## Watching
| Item | Waiting On | Details | Links |
|------|------------|---------|-------|
| pty-win server restart | Done | Verified 2026-03-31: feed toolbar, resume kick, identity picker all live | |
| Root folder indent alignment | Done | Completed | |
| Drag-and-drop pane reorder | Done | Completed | |
| EM coordination efficiency | Next work session | 36 msgs → target ~8-10 | LOG.md 2026-02-21 |

## Completed
| Date | Item | Outcome |
|------|------|---------|
| 2026-04-02 | Dashboard polish: text, clickable rows, merged table, collapsible cards | 4 items shipped |
| 2026-04-02 | Pane separation: gap + 2px border + dimmed topbar + bg contrast | Multiple iterations — gray→steel-blue, 1px→4px gap, dimmed topbar |
| 2026-04-02 | PID file idle detection investigation | BG_SESSIONS off — blocked. Upgrade path documented in Claude-KB.md |
| 2026-04-02 | Claude-KB.md restructured to 4 sections | Own KB + team-manual updated. CLAUDE.md debugging rule added. |
| 2026-04-02 | Claude-KB.md expanded to 4 sections | team-manual.md updated, sent to sam |
| 2026-04-02 | Context-independence rule + checkpoint prompt update | team-manual.md + injection prompts |
| 2026-04-01 | Unfocused pane border + merged Dashboard/Diag | #505050 border, single combined tab |
| 2026-04-01 | Cost tracking reverted to regex scraping | Hook removed, dual regex (live + exit), works multi-instance |
| 2026-04-01 | jade onboarding | claude-code-src analyst, first task complete, cleared for next task |
| 2026-04-01 | Per-session cost tracking | Regex on PTY stream, costs.json persistence, Diag tab |
| 2026-04-01 | Add Root button → Folders header | Moved from bottom to header bar |
| 2026-04-01 | fellow-agents starter kit | 5 commits — pty-win + emcom + start.ps1 + templates + README |
| 2026-04-01 | Focused pane border → orange | #d4882a, topbar tint + border |
| 2026-03-31 | Pane topbar: VS Code left + identity click → feed | Frontend-only |
| 2026-03-31 | Claude --resume context menu | Right-click resume on AI cmd-tag + pane topbar |
| 2026-03-31 | Session row highlight + pane topbar VS Code button | Both verified, frontend-only |
| 2026-03-31 | AI preset label in pane topbar | Spec→moss→implemented→verified. Frontend-only change. |
| 2026-03-31 | pty-win post-restart verification | Feed toolbar, resume kick, identity picker, dashboard all live |
| 2026-03-28 | pty-learner ML pipeline | End-to-end: train→ONNX→pty-win integration (moss d7de3df) |
| 2026-03-28 | pty-learner agent_review.py | Export/apply modes for amber's AI labeling (9b88b0c) |
| 2026-03-28 | pty-learner PyInstaller build | build.ps1 + 5 exes (browse/train/evaluate/export/agent-review) |
| 2026-03-28 | pty-learner browse.py | Lazy loading, regex opinion, priority ordering (c5e298e) |
| 2026-03-28 | pty-learner workspace | ML pipeline scaffold + data format aligned with pty-win (6ec51ba) |
| 2026-03-27 | RFC: utility script workspaces | Replied with 4 script ideas + structural feedback |
| 2026-03-25 | briefing.md adoption | Created per finalized spec, added to CLAUDE.md on-load |
| 2026-03-25 | RFC: Onboarding → Team Operating Manual | Replied with new-agent feedback; manual shipped (3-tier) |
| 2026-03-24 | emcom registration | Registered as milo |
| 2026-02-21 | EM coordination bug fixes | 5 bugs fixed across 3 files |
| 2026-02-21 | emailag viewer restyle | Clean dark dashboard theme |
