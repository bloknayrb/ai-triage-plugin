# CLAUDE.md

Instructions for Claude Code when working on this Obsidian plugin.

## Project Overview

**Priority Dashboard Plugin** - An Obsidian plugin that displays tracked priorities from `Claude-State-Tracking.md` with PIP coaching reminders and habit tracking.

### Architecture Change (v0.2.0)

The plugin was transformed from an AI triage system to a priority dashboard:

```
BEFORE (Triage Queue):
  File watcher → Ollama classification → Queue → Manual review → TaskNote

AFTER (Priority Dashboard):
  Claude-State-Tracking.md → StateLoader → Dashboard View
  (State file updated by /track command as usual)
```

**Why?** The triage model created cognitive load even when working perfectly (30% "Unknown" rate, 4 decisions per item). The dashboard model just displays what `/track` already captured - zero classification overhead.

## Build Commands

```bash
npm install     # Install dependencies
npm run dev     # Watch mode (auto-rebuild on changes)
npm run build   # Production build (typecheck + bundle)
npm run lint    # ESLint check
```

## Project Structure

```
src/
├── main.ts                      # Plugin entry point
├── settings.ts                  # Settings schema and panel
├── state-types.ts               # Zod schemas for state file data
├── state-loader.ts              # Parse Claude-State-Tracking.md
├── weekly-report-generator.ts   # Weekly PIP report file operations
├── views/
│   ├── priority-dashboard-view.ts  # Priority Dashboard sidebar
│   └── chat-sidebar-view.ts        # Note Chat sidebar (future)
├── ollama-client.ts             # Local Ollama API client (future chat)
├── triage-queue.ts              # [Legacy] Queue persistence
├── file-watcher.ts              # [Legacy] Rate-limited file monitoring
├── context-loader.ts            # [Legacy] Dynamic triage context loader
├── tasknote-creator.ts          # TaskNote creation orchestrator
├── domain/                      # Pure TypeScript domain logic
│   ├── weekly-report.ts         # Weekly PIP report data & markdown generation
│   ├── deliverables.ts          # Review periods, deadlines
│   ├── change-orders.ts         # CO lifecycle and checklists
│   ├── testing.ts               # FAT/IAT/SAT/OAT definitions
│   ├── interoperability.ts      # IAG issue detection
│   ├── escalation.ts            # Deadline escalation rules
│   └── generic-task.ts          # Generic TaskNote generator
├── modals/
│   ├── create-task-modal.ts     # TaskNote creation modal
│   ├── folder-suggest-modal.ts  # Folder picker
│   └── link-task-modal.ts       # TaskNote picker
└── prompts/
    └── tolling-triage-prompt.ts # [Legacy] Triage system prompt
```

## Key Features

### Priority Dashboard

The main view displays:
- **PIP Status Banner** - Day X of 90, current phase, progress bar, next check-in countdown
- **EOD Reminder** - Appears after 2pm Eastern if EOD status not sent today
- **Overdue Tasks** - Red highlight, sorted by days overdue
- **Due This Week / Next Week** - Upcoming deadlines
- **Stated Priorities** - From manager meetings (ranked #1, #2, #3)
- **Habit Tracker** - EOD status and morning check progress (X/5 per week)
- **Generate Report Button** - Footer button to create weekly PIP report (visible when PIP active)

### Weekly PIP Reports

Auto-generates comprehensive weekly reports for PIP check-ins:

**Report Contents:**
- Habit metrics (EOD status, morning check, same-day ack with daily breakdown)
- Task accomplishments (completed tasks linked to stated priorities)
- Priority alignment (status of each stated priority)
- Milestone progress (criteria met/total for each milestone)

**Report Format:**
```markdown
---
title: "Weekly PIP Report - Week of 2026-01-27"
type: weekly-report
pip_week: 5
pip_day: 33
created: 2026-01-27
---

# Weekly PIP Report
**Week of January 27, 2026**
**PIP Day 33 of 90 | Week 5 | Intermediate Phase**

## Habit Metrics
- EOD Status: 4/5 (80%) - Mon: ✓ Tue: ✓ Wed: ✓ Thu: ○ Fri: ✓
...
```

**Generation:**
- Manual: Command palette → "Generate Weekly PIP Report" or dashboard footer button
- Automatic: Scheduled check at configured day/hour (default: Monday 9am ET)
- Duplicate prevention: Checks for existing `PIP-Report-Week-YYYY-MM-DD.md` before creating

**Domain Logic (`src/domain/weekly-report.ts`):**
- `calculateWeekBoundaries()` - Monday-Sunday range in Eastern Time
- `aggregateHabitMetrics()` - Summarize EOD/morning/same-day-ack stats
- `mapAccomplishmentsToPriorities()` - Link completed tasks to stated priorities
- `generateWeeklyReportMarkdown()` - Render final markdown with frontmatter

### State Loader (`src/state-loader.ts`)

Parses `Claude-State-Tracking.md`:
- Extracts JSON from markdown code blocks
- Validates with Zod schemas
- Caches by content hash for performance
- Handles ~50KB files (no size limit like context-loader)
- Returns clear error messages for malformed data

### State Types (`src/state-types.ts`)

Zod schemas matching the state file structure:
- `ActiveTaskNoteSchema` - Task with filename, status, due date, days overdue
- `PipTrackingSchema` - PIP day count, phase, habits, milestones
- `StatedPrioritiesSchema` - Ranked priorities from manager
- `DashboardState` - Transformed data for UI rendering

## Key Patterns

### Security Constraints
- **Ollama URL is hardcoded to 127.0.0.1** - never allow DNS resolution or external URLs
- State file is read-only (dashboard doesn't write)
- Files with `#confidential` or `#sensitive` tags are never processed

### Obsidian API Patterns
- Views extend `ItemView` and use `contentEl`
- Use `plugin.registerInterval()` for auto-refresh timers
- Settings use `loadData()` / `saveData()` for persistence

### Time Zone Handling
- EOD reminder checks Eastern Time: `new Date().toLocaleString('en-US', {timeZone: 'America/New_York'})`
- "After 2pm" triggers EOD status reminder if not sent

## Settings

### Dashboard Settings
- `stateFilePath` - Path to Claude-State-Tracking.md (default: `99-System/Claude-State-Tracking.md`)
- `showPipCoaching` - Display PIP banner, habits, EOD reminders (default: true)
- `autoRefreshDashboard` - Auto-refresh every 5 minutes (default: true)

### Weekly PIP Reports Settings
- `weeklyReportsFolder` - Folder for weekly reports (default: `WeeklyReports`)
- `autoGenerateWeeklyReport` - Auto-generate at scheduled time (default: true)
- `reportGenerationDay` - Day to generate reports: `sunday` or `monday` (default: `monday`)
- `reportGenerationHour` - Hour to generate (0-23, Eastern Time) (default: 9)

### TaskNote Settings
- `taskNotesFolder` - Where TaskNotes are stored (default: `TaskNotes`)
- `projectsBasePath` - Base folder for project discovery (default: `01-Projects`)
- `openTaskAfterCreation` - Auto-open created TaskNote (default: true)

### Advanced (for future chat feature)
- `ollamaBaseUrl`, `triageModel`, `embeddingModel`, `requestTimeout`

### Legacy (deprecated, kept for backwards compatibility)
- `watchedFolders`, `autoTriageEnabled`, `triageContextPath`

## Commands

- `Open Priority Dashboard` - Open/focus the dashboard sidebar
- `Refresh Priority Dashboard` - Force refresh state from file
- `Generate Weekly PIP Report` - Create weekly report for current week (if PIP active)
- `Chat about current note` - Open chat sidebar (future feature)
- `Test Ollama Connection` - Verify Ollama is accessible

## Testing

To test the plugin:
1. Build: `npm run build`
2. Copy `main.js`, `styles.css`, `manifest.json` to test vault's `.obsidian/plugins/ai-triage-plugin/`
3. Enable plugin in Obsidian settings
4. Verify dashboard loads and shows state file data
5. Test: rename state file → verify error UI appears
6. Test: click task → verify TaskNote opens

### Weekly Report Testing
1. Run "Generate Weekly PIP Report" command
2. Verify report created in `WeeklyReports/` folder with correct filename
3. Verify report contains all 4 sections (Habits, Accomplishments, Priority Alignment, Milestones)
4. Run command again → expect "Report already exists" notice
5. Disable PIP in state file → expect "PIP tracking is not active" notice
6. Test auto-generation: set day to current day, hour to next hour, verify it generates

### Error States to Verify
- **Missing file**: "State file not found" with path to settings
- **Parse error**: Error banner with details, logged to console
- **Partial data**: Available sections render, warning for missing ones
- **PIP inactive**: Weekly report shows appropriate notice, button hidden in dashboard

## Dependencies

- `obsidian` - Obsidian plugin API
- `zod` - Runtime schema validation for state file parsing

## Current Status (v0.3.0)

### Completed
- Priority Dashboard view with PIP coaching
- State loader with Zod validation and caching
- Dashboard sections: overdue, due this week, stated priorities, habits
- EOD reminder after 2pm Eastern
- Settings panel with dashboard configuration
- Weekly PIP report generation (manual + scheduled)
- Report includes habits, accomplishments, priority alignment, milestones
- Legacy triage code preserved for backwards compatibility

### Future Enhancements
- Chat sidebar for "chat with notes" feature
- SimpleMem MCP integration for Teams indexing
