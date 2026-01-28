/**
 * Modal for confirming TaskNote creation with project selection
 */

import { App, Modal, Setting, Notice } from 'obsidian';
import { TriageItem, TriageSuggestion } from '../triage-queue';

export interface CreateTaskModalResult {
	confirmed: boolean;
	project?: string;
	title?: string;
	priority?: 'critical' | 'high' | 'medium' | 'low';
	dueDate?: string;
}

/**
 * Modal for confirming and customizing TaskNote creation
 */
export class CreateTaskModal extends Modal {
	private item: TriageItem;
	private inferredProject: string | null;
	private availableProjects: string[];
	private onConfirm: (result: CreateTaskModalResult) => void;

	// Form state
	private selectedProject: string = '';
	private editedTitle: string;
	private editedPriority: 'critical' | 'high' | 'medium' | 'low';
	private editedDueDate: string;

	constructor(
		app: App,
		item: TriageItem,
		inferredProject: string | null,
		availableProjects: string[],
		onConfirm: (result: CreateTaskModalResult) => void
	) {
		super(app);
		this.item = item;
		this.inferredProject = inferredProject;
		this.availableProjects = availableProjects;
		this.onConfirm = onConfirm;

		// Initialize form state from suggestion
		const suggestion = this.getMergedSuggestion();
		this.editedTitle = suggestion.title || item.fileName;
		this.editedPriority = suggestion.priority || 'medium';
		this.editedDueDate = suggestion.dueDate || '';
		this.selectedProject = inferredProject || '';
	}

	/**
	 * Get suggestion merged with user edits
	 */
	private getMergedSuggestion(): TriageSuggestion {
		return {
			...this.item.suggestion,
			...this.item.userEdits
		};
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('create-task-modal');

		// Header
		contentEl.createEl('h2', { text: 'Create TaskNote' });

		const suggestion = this.getMergedSuggestion();

		// Category badge (read-only)
		const categoryEl = contentEl.createDiv({ cls: 'modal-category-badge' });
		categoryEl.createSpan({
			text: this.formatCategory(suggestion.category),
			cls: `triage-category triage-category-${suggestion.category.toLowerCase()}`
		});

		// Title (editable)
		new Setting(contentEl)
			.setName('Title')
			.addText(text => text
				.setValue(this.editedTitle)
				.onChange(value => {
					this.editedTitle = value;
				}));

		// Client (read-only display)
		if (suggestion.client) {
			new Setting(contentEl)
				.setName('Client')
				.addText(text => text
					.setValue(suggestion.client || '')
					.setDisabled(true));
		}

		// Project (dropdown or text input)
		this.renderProjectField(contentEl);

		// Priority (dropdown)
		new Setting(contentEl)
			.setName('Priority')
			.addDropdown(dropdown => dropdown
				.addOptions({
					'critical': 'Critical',
					'high': 'High',
					'medium': 'Medium',
					'low': 'Low'
				})
				.setValue(this.editedPriority)
				.onChange(value => {
					this.editedPriority = value as 'critical' | 'high' | 'medium' | 'low';
				}));

		// Due Date (optional)
		new Setting(contentEl)
			.setName('Due Date')
			.setDesc('Optional - leave blank for no due date')
			.addText(text => text
				.setPlaceholder('YYYY-MM-DD')
				.setValue(this.editedDueDate)
				.onChange(value => {
					this.editedDueDate = value;
				}));

		// Source file reference (read-only)
		const sourceEl = contentEl.createDiv({ cls: 'modal-source-file' });
		sourceEl.createEl('small', {
			text: `Source: ${this.item.fileName}`
		});

		// Confidence indicator
		const confidenceEl = contentEl.createDiv({ cls: 'modal-confidence' });
		confidenceEl.createEl('small', {
			text: `Triage confidence: ${Math.round(suggestion.confidence * 100)}%`
		});

		// Action buttons
		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

		const cancelBtn = buttonContainer.createEl('button', {
			text: 'Cancel',
			cls: 'modal-cancel-btn'
		});
		cancelBtn.addEventListener('click', () => {
			this.close();
		});

		const createBtn = buttonContainer.createEl('button', {
			text: 'Create Task',
			cls: 'mod-cta'
		});
		createBtn.addEventListener('click', () => {
			this.handleConfirm();
		});
	}

	/**
	 * Render project field - dropdown if projects available, text input otherwise
	 */
	private renderProjectField(container: HTMLElement): void {
		if (this.availableProjects.length > 0) {
			new Setting(container)
				.setName('Project')
				.setDesc(this.inferredProject ? `Inferred: ${this.inferredProject}` : 'Select a project')
				.addDropdown(dropdown => {
					// Add empty option
					dropdown.addOption('', '(Select project)');

					// Add available projects
					for (const project of this.availableProjects) {
						dropdown.addOption(project, project);
					}

					// Add "Other" option for custom input
					dropdown.addOption('__other__', 'Other (custom)...');

					dropdown.setValue(this.selectedProject);
					dropdown.onChange(value => {
						if (value === '__other__') {
							// Show custom input modal or prompt
							this.promptForCustomProject();
						} else {
							this.selectedProject = value;
						}
					});
				});
		} else {
			// No projects found - show text input
			new Setting(container)
				.setName('Project')
				.setDesc('Enter project name (optional)')
				.addText(text => text
					.setPlaceholder('e.g., NIOP Interoperability')
					.setValue(this.selectedProject)
					.onChange(value => {
						this.selectedProject = value;
					}));
		}
	}

	/**
	 * Prompt for custom project name
	 */
	private promptForCustomProject(): void {
		// Simple prompt using Notice input (Obsidian doesn't have built-in prompts)
		// For now, just clear the selection and let user type
		const input = prompt('Enter custom project name:');
		if (input) {
			this.selectedProject = input;
			// Re-render to show the custom value
			this.onOpen();
		}
	}

	/**
	 * Handle confirmation
	 */
	private handleConfirm(): void {
		// Validate
		if (!this.editedTitle.trim()) {
			new Notice('Title is required');
			return;
		}

		// Validate due date format if provided
		if (this.editedDueDate && !/^\d{4}-\d{2}-\d{2}$/.test(this.editedDueDate)) {
			new Notice('Due date must be in YYYY-MM-DD format');
			return;
		}

		this.onConfirm({
			confirmed: true,
			project: this.selectedProject || undefined,
			title: this.editedTitle,
			priority: this.editedPriority,
			dueDate: this.editedDueDate || undefined
		});

		this.close();
	}

	/**
	 * Format category for display
	 */
	private formatCategory(category: string): string {
		const labels: Record<string, string> = {
			'DELIVERABLE_REVIEW': 'Deliverable Review',
			'CHANGE_ORDER': 'Change Order',
			'TESTING_MILESTONE': 'Testing Milestone',
			'INTEROPERABILITY_ISSUE': 'Interop Issue',
			'SYSTEM_ISSUE': 'System Issue',
			'MEETING_FOLLOWUP': 'Meeting Follow-up',
			'VENDOR_CORRESPONDENCE': 'Vendor Correspondence',
			'CLIENT_CORRESPONDENCE': 'Client Correspondence',
			'INFORMATIONAL': 'Informational',
			'UNCLEAR': 'Needs Review'
		};
		return labels[category] || category;
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
