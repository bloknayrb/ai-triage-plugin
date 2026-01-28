# CLAUDE.md

Instructions for Claude Code when working on this Obsidian plugin.

## Project Overview

**AI Triage Plugin** - An Obsidian plugin that uses local Ollama to classify incoming emails and Teams messages with tolling domain expertise.

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
├── main.ts                 # Plugin entry point
├── settings.ts             # Settings schema and panel
├── ollama-client.ts        # Local Ollama API client
├── triage-queue.ts         # Queue persistence and state
├── file-watcher.ts         # Rate-limited file monitoring
├── domain/                 # Pure TypeScript domain logic (no Obsidian deps)
│   ├── deliverables.ts     # Review periods, deadlines, business days
│   ├── change-orders.ts    # CO lifecycle and checklists
│   ├── testing.ts          # FAT/IAT/SAT/OAT definitions
│   ├── interoperability.ts # IAG issue detection
│   └── escalation.ts       # Deadline escalation rules
├── prompts/
│   └── tolling-triage-prompt.ts  # Triage system prompt
├── views/
│   ├── triage-queue-view.ts      # Triage Queue sidebar
│   └── chat-sidebar-view.ts      # Note Chat sidebar
└── reports/                # (TODO) Weekly report generation
```

## Key Patterns

### Security Constraints
- **Ollama URL is hardcoded to 127.0.0.1** - never allow DNS resolution or external URLs
- Input sanitization escapes `< > [ ]` before sending to LLM
- Files with `#confidential` or `#sensitive` tags are never processed

### Obsidian API Patterns
- Views extend `ItemView` and use `contentEl` (not custom `containerEl`)
- Use `plugin.registerEvent()` for vault events (auto-cleanup on unload)
- Use `plugin.registerInterval()` for timers
- Settings use `loadData()` / `saveData()` for persistence

### Event Handling
- `TriageQueue` uses a custom event emitter pattern with `on()`/`off()`
- Store listener references as class properties to enable proper cleanup

### Rate Limiting
- File watcher uses manual debounce (Obsidian's `debounce()` actually throttles)
- Max 2 concurrent triages to avoid overwhelming Ollama
- Teams messages batched with 5-minute quiet window

## Domain Modules

The `src/domain/` modules are **pure TypeScript with no Obsidian imports**. This enables:
- Easy unit testing without mocking Obsidian
- Reusable logic across different contexts
- Clear separation of concerns

When adding domain logic, keep it in these modules rather than mixing with Obsidian code.

## Current Status

### Completed
- Plugin scaffold with settings panel
- OllamaClient with timeout and input sanitization
- RateLimitedWatcher with Teams batching
- TriageQueue with JSON persistence
- Triage prompts with tolling domain knowledge
- View shells (Triage Queue, Chat Sidebar)
- Domain logic modules (deliverables, change orders, testing, interop, escalation)

### TODO
- Wire "Create Task" button to generate TaskNotes
- Wire "Link to Task" button with task picker modal
- Implement inline editing in Triage Queue
- Implement weekly report generation
- Add SimpleMem MCP integration for Teams indexing

## Testing

To test the plugin:
1. Build: `npm run build`
2. Copy `main.js`, `styles.css`, `manifest.json` to test vault
3. Enable plugin in Obsidian settings
4. Ensure Ollama is running with `gemma3:latest` model

## Dependencies

- `obsidian` - Obsidian plugin API
- No external runtime dependencies (Ollama is accessed via fetch)
