# Tracker
Last updated: 2026-03-31

## In Motion
| Item | Status | Owner | Notes/Links |
|------|--------|-------|-------------|
| pty-win server restart | Rajan | Cost regex, merged dashboard, unfocused border, hook revert, checkpoint prompts |
| Dashboard flicker fix | Done | milo | 21359a8 — DOM patching in-place, 79 tests pass |
| Cost bar chart | Done | milo | d1df0f9 — horizontal bars in Agents tab, color-coded by cost |
| Needs-input indicator | Done | milo | 796778c — busy+0cb/s + permission_prompt hook. Amber highlight. |
| Agents tab (full feature) | Done | milo | cb/s column, compact table, font match, empty state fix, needs-input |
| Ctrl+F5 fix v3 | Done | milo | 341337b — refit on WS sessions message (event-driven, not timer) |
| Focus loss + feed recipient + tracker panel | Done | milo | Multiple commits — see briefing |
| fellow-agents release workflow | Done | milo | 461f96a+756675f+1dd60ef — GHA builds emcom+tracker+emcom-server+pty-win, 3 platforms, publishes release. v1.0.0 published. |
| fellow-agents E2E test | In progress | milo | 2x D2s_v4 VMs in rajan-rg (eastus). dev-windows deallocated, dev-linux running. xfce+xrdp installing. Next: clone + setup.sh test. |
| Azure tenant migration | Done | milo | Old BAMI1 (9a9b49fd) → new teamssdk (3f3d1cea). azure-env.json/md updated. bolt, sage, blake notified. |
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
| 2026-04-04 | Hook-based idle detection | Stop + Notification + UserPromptSubmit hooks replace heuristics. research/hooks.md. |
| 2026-04-03 | Shutdown double-Ctrl+C bug fix | Re-entry guard prevents killing sessions mid-save |
| 2026-04-03 | Cost in checkpoint prompts + last-active dashboard column | Agents see their cost; dashboard shows when sessions were last active |
| 2026-04-03 | # in --body permission prompt fix | Pipe body via stdin; confirmed syntax with frost |
| 2026-04-02 | Drag-and-drop sessions onto workspace tabs | Sessions + folders draggable, amber drop targets |
| 2026-04-02 | emcom UX: 5 improvements + AOT rebuild | check, inbox --full, read-all, batch tag, reply --handled |
| 2026-04-02 | Scout cost investigation | Context accumulation × cold cache. Fix: Haiku + /clear = ~50x reduction |
| 2026-04-02 | Dashboard + pane separation polish | Merged table, collapsible cards, #aaa border, dimmed topbar, 4px gap, cost last col |
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
