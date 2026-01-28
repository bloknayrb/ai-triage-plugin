/**
 * Modal for selecting an existing TaskNote to link to a triage item
 */

import { App, SuggestModal, TFile, TFolder } from 'obsidian';

export interface TaskSuggestion {
    file: TFile;
    title: string;
    status: 'open' | 'in_progress' | 'completed' | 'unknown';
    priority: 'critical' | 'high' | 'medium' | 'low' | 'unknown';
    client?: string;
    project?: string;
}

/**
 * SuggestModal for searching and selecting TaskNotes
 * Uses SuggestModal (not FuzzySuggestModal) for custom badge rendering control
 */
export class LinkTaskModal extends SuggestModal<TaskSuggestion> {
    private taskNotesFolder: string;
    private onSelect: (task: TaskSuggestion) => void;
    private suggestions: TaskSuggestion[] = [];

    constructor(app: App, taskNotesFolder: string, onSelect: (task: TaskSuggestion) => void) {
        super(app);
        this.taskNotesFolder = taskNotesFolder;
        this.onSelect = onSelect;
        this.setPlaceholder('Search tasks...');
        this.emptyStateText = 'No TaskNotes found. Create one first.';
    }

    onOpen(): void {
        super.onOpen();
        this.suggestions = this.loadTaskNotes();
    }

    /**
     * Load all TaskNotes from the configured folder
     */
    private loadTaskNotes(): TaskSuggestion[] {
        const folder = this.app.vault.getAbstractFileByPath(this.taskNotesFolder);
        if (!folder || !(folder instanceof TFolder)) return [];

        return folder.children
            .filter((f): f is TFile => f instanceof TFile && f.extension === 'md')
            .map(file => this.parseTaskSuggestion(file))
            .sort((a, b) => {
                // Active tasks first (non-completed before completed)
                const aActive = a.status !== 'completed' ? 0 : 1;
                const bActive = b.status !== 'completed' ? 0 : 1;
                if (aActive !== bActive) return aActive - bActive;
                // Then by priority
                const priorityOrder: Record<TaskSuggestion['priority'], number> = {
                    critical: 0,
                    high: 1,
                    medium: 2,
                    low: 3,
                    unknown: 4
                };
                return (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4);
            });
    }

    /**
     * Parse a TaskNote file into a TaskSuggestion
     */
    private parseTaskSuggestion(file: TFile): TaskSuggestion {
        const cache = this.app.metadataCache.getFileCache(file);
        const fm = cache?.frontmatter;
        return {
            file,
            title: fm?.title || file.basename.replace(/^TaskNote-/, ''),
            status: this.normalizeStatus(fm?.status),
            priority: this.normalizePriority(fm?.priority),
            client: fm?.client,
            project: fm?.project
        };
    }

    /**
     * Normalize status value from frontmatter
     */
    private normalizeStatus(status: unknown): TaskSuggestion['status'] {
        if (typeof status !== 'string') return 'unknown';
        const normalized = status.toLowerCase().replace(/[_-]/g, '_');
        if (normalized === 'open') return 'open';
        if (normalized === 'in_progress' || normalized === 'inprogress') return 'in_progress';
        if (normalized === 'completed' || normalized === 'done' || normalized === 'closed') return 'completed';
        return 'unknown';
    }

    /**
     * Normalize priority value from frontmatter
     */
    private normalizePriority(priority: unknown): TaskSuggestion['priority'] {
        if (typeof priority !== 'string') return 'unknown';
        const normalized = priority.toLowerCase();
        if (normalized === 'critical') return 'critical';
        if (normalized === 'high') return 'high';
        if (normalized === 'medium') return 'medium';
        if (normalized === 'low') return 'low';
        return 'unknown';
    }

    /**
     * Filter suggestions based on query
     */
    getSuggestions(query: string): TaskSuggestion[] {
        const lower = query.toLowerCase();
        return this.suggestions.filter(s =>
            s.title.toLowerCase().includes(lower) ||
            s.client?.toLowerCase().includes(lower) ||
            s.project?.toLowerCase().includes(lower)
        );
    }

    /**
     * Render a suggestion item with badges
     */
    renderSuggestion(task: TaskSuggestion, el: HTMLElement): void {
        el.addClass('link-task-suggestion');

        // Title line
        el.createDiv({ text: task.title, cls: 'link-task-title' });

        // Meta line with badges
        const metaEl = el.createDiv({ cls: 'link-task-meta' });

        // Status badge
        metaEl.createSpan({
            text: this.formatStatus(task.status),
            cls: `link-task-badge link-task-status-${task.status}`
        });

        // Priority badge (only if known)
        if (task.priority !== 'unknown') {
            metaEl.createSpan({
                text: task.priority,
                cls: `link-task-badge link-task-priority-${task.priority}`
            });
        }

        // Client/Project info
        if (task.client) {
            metaEl.createSpan({ text: task.client, cls: 'link-task-client' });
        }
        if (task.project) {
            metaEl.createSpan({ text: `- ${task.project}`, cls: 'link-task-project' });
        }
    }

    /**
     * Format status for display
     */
    private formatStatus(status: TaskSuggestion['status']): string {
        const labels: Record<TaskSuggestion['status'], string> = {
            'open': 'Open',
            'in_progress': 'In Progress',
            'completed': 'Completed',
            'unknown': 'Unknown'
        };
        return labels[status];
    }

    /**
     * Handle selection
     */
    onChooseSuggestion(task: TaskSuggestion, evt: MouseEvent | KeyboardEvent): void {
        this.onSelect(task);
    }
}
