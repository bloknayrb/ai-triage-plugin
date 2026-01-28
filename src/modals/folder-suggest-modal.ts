/**
 * Modal for selecting vault folders with fuzzy search
 */

import { App, SuggestModal, TFolder, Notice } from 'obsidian';

export interface FolderSuggestion {
    folder: TFolder;
    path: string;
    name: string;
    depth: number;
}

/**
 * SuggestModal for browsing and selecting vault folders
 * Excludes hidden folders and already-selected folders
 */
export class FolderSuggestModal extends SuggestModal<FolderSuggestion> {
    private onSelect: (folder: FolderSuggestion) => void;
    private excludeFolders: string[];
    private suggestions: FolderSuggestion[] = [];

    constructor(app: App, onSelect: (folder: FolderSuggestion) => void, excludeFolders: string[] = []) {
        super(app);
        this.onSelect = onSelect;
        // Normalize exclude folders - remove trailing slashes for comparison
        this.excludeFolders = excludeFolders.map(f => f.replace(/\/+$/, ''));
        this.setPlaceholder('Search folders...');
        this.emptyStateText = 'No folders found.';
    }

    onOpen(): void {
        super.onOpen();
        this.suggestions = this.loadAllFolders();
    }

    /**
     * Recursively load all folders from the vault
     * Excludes hidden folders (starting with .) and already-selected folders
     */
    private loadAllFolders(): FolderSuggestion[] {
        const folders: FolderSuggestion[] = [];
        const rootFolder = this.app.vault.getRoot();

        const walkFolder = (folder: TFolder, depth: number) => {
            for (const child of folder.children) {
                if (!(child instanceof TFolder)) continue;

                // Skip hidden folders (e.g., .obsidian, .git)
                if (child.name.startsWith('.')) continue;

                // Skip vault root (empty path)
                if (child.path === '') continue;

                // Skip already-selected folders
                if (this.excludeFolders.includes(child.path)) continue;

                folders.push({
                    folder: child,
                    path: child.path,
                    name: child.name,
                    depth: depth
                });

                // Recurse into subfolders
                walkFolder(child, depth + 1);
            }
        };

        walkFolder(rootFolder, 0);

        // Sort by path for consistent ordering
        return folders.sort((a, b) => a.path.localeCompare(b.path));
    }

    /**
     * Filter suggestions based on query (case-insensitive fuzzy match)
     */
    getSuggestions(query: string): FolderSuggestion[] {
        if (!query) return this.suggestions;

        const lower = query.toLowerCase();
        return this.suggestions.filter(s =>
            s.path.toLowerCase().includes(lower) ||
            s.name.toLowerCase().includes(lower)
        );
    }

    /**
     * Render a folder suggestion with icon and indentation
     */
    renderSuggestion(suggestion: FolderSuggestion, el: HTMLElement): void {
        el.addClass('folder-suggest-item');

        // Add depth-based indentation class
        if (suggestion.depth > 0 && suggestion.depth <= 5) {
            el.addClass(`folder-suggest-depth-${suggestion.depth}`);
        }

        // Folder icon
        const iconEl = el.createSpan({ cls: 'folder-suggest-icon' });
        iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;

        // Path text
        el.createSpan({ text: suggestion.path, cls: 'folder-suggest-path' });
    }

    /**
     * Handle folder selection
     */
    onChooseSuggestion(suggestion: FolderSuggestion, evt: MouseEvent | KeyboardEvent): void {
        this.onSelect(suggestion);
    }
}
