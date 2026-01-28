# AI Triage Plugin for Obsidian

AI-powered triage for incoming emails and Teams messages with tolling domain expertise. Uses **local Ollama only** (127.0.0.1) - no external API calls, keeping your data secure.

## Features

### Auto-Triage Incoming Items
- Watches `Emails/`, `TeamsChats/`, and `Calendar/` folders for new files
- Classifies items into 10 categories using local Ollama (gemma3)
- Teams messages are batched by conversation (5-minute quiet window) for better context
- Sensitive files (`#confidential`, `#sensitive`) are automatically skipped

### Triage Queue
- Review AI suggestions before committing changes
- Edit titles, clients, priorities, and due dates inline
- Create TaskNotes, link to existing tasks, or dismiss items
- Persistent across Obsidian restarts

### Note Chat Sidebar
- Ask questions about the currently open note
- Context-aware responses using local Ollama
- Suggested task creation goes to Triage Queue for review

### Tolling Domain Expertise
Built-in knowledge of:
- **Clients**: DRPA, VDOT, MDTA, DelDOT
- **Vendors**: TransCore, Conduent, Kapsch, Neology
- **Documents**: SDDD, ICD, Test Plans, O&M Manuals
- **Testing**: FAT, IAT, SAT, OAT, UAT phases
- **Interoperability**: IAG, E-ZPass, reciprocity issues

### Classification Categories
1. `DELIVERABLE_REVIEW` - Vendor submittal requiring review
2. `CHANGE_ORDER` - Contract modification request
3. `TESTING_MILESTONE` - FAT/IAT/SAT/OAT coordination
4. `INTEROPERABILITY_ISSUE` - IAG/reciprocity problems (auto-flagged if financial impact)
5. `SYSTEM_ISSUE` - Operational problems
6. `MEETING_FOLLOWUP` - Meeting notes with action items
7. `VENDOR_CORRESPONDENCE` - General vendor communications
8. `CLIENT_CORRESPONDENCE` - Toll authority communications
9. `INFORMATIONAL` - FYI only
10. `UNCLEAR` - Flagged for human review

## Requirements

- **Obsidian** 1.0.0 or later
- **Ollama** running locally on port 11434
  - Recommended model: `gemma3:latest` for triage/chat
  - Optional: `qwen3-embedding:8b` for semantic search

## Installation

### From Source
```bash
git clone https://github.com/bkolb/ai-triage-plugin.git
cd ai-triage-plugin
npm install
npm run build
```

Then copy `main.js`, `styles.css`, and `manifest.json` to:
```
YourVault/.obsidian/plugins/ai-triage/
```

### Development
```bash
npm run dev   # Watch mode with auto-rebuild
```

## Configuration

Open Settings → AI Triage to configure:

| Setting | Default | Description |
|---------|---------|-------------|
| Triage Model | `gemma3:latest` | Ollama model for classification |
| Embedding Model | `qwen3-embedding:8b` | Model for semantic search |
| Watched Folders | `Emails/, TeamsChats/, Calendar/` | Folders to monitor |
| Skip Tags | `#confidential, #sensitive` | Tags that prevent triage |
| Default Client | `DRPA` | Client when not auto-detected |
| Teams Batch Delay | 5 minutes | Wait time before triaging Teams conversations |
| Max Concurrent Triages | 2 | Rate limiting |

## Commands

| Command | Hotkey | Description |
|---------|--------|-------------|
| Open Triage Queue | - | Opens the triage queue sidebar |
| Chat about current note | - | Opens chat sidebar for active note |
| Generate Weekly Report | - | Creates 9-section status report |
| Test Ollama Connection | - | Verifies Ollama is running |

## Security

This plugin prioritizes security:

- **Local only**: Ollama URL is hardcoded to `127.0.0.1:11434` - no DNS resolution, no external calls
- **No process spawning**: All AI calls are HTTP to local Ollama
- **Input sanitization**: Content is escaped before sending to LLM
- **Sensitive file detection**: Files with sensitive tags are never processed
- **30-second timeout**: Prevents hung requests

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              AI Triage Plugin                        │
├─────────────────────────────────────────────────────┤
│  File Watcher → OllamaClient → Triage Queue → Views │
│       ↓              ↓              ↓               │
│  Rate Limited    127.0.0.1     Persistent JSON      │
│  Teams Batching  30s timeout   Event-driven UI      │
└─────────────────────────────────────────────────────┘
                      │
                      ▼
            Ollama (localhost:11434)
            gemma3:latest / qwen3-embedding:8b
```

## Domain Logic Modules

The plugin includes pure TypeScript modules for tolling domain logic:

- `domain/deliverables.ts` - Review periods, deadline calculation, business days
- `domain/change-orders.ts` - CO lifecycle, review checklists
- `domain/testing.ts` - FAT/IAT/SAT/OAT/UAT definitions
- `domain/interoperability.ts` - IAG issue detection, urgency classification
- `domain/escalation.ts` - Deadline escalation rules

## Companion to TaskNotes

This plugin is designed to complement the TaskNotes plugin:
- AI Triage handles **incoming item classification**
- TaskNotes handles **task management** (views, kanban, calendar)
- Created tasks follow the TaskNotes YAML frontmatter schema

## License

MIT

## Author

Brian Kolb
