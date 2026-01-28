import { ItemView, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import AITriagePlugin from '../main';
import { TriageItem, TriageCategory } from '../triage-queue';
import { TaskNoteCreator, inferProject, getProjectsForClient } from '../tasknote-creator';
import { CreateTaskModal, CreateTaskModalResult } from '../modals/create-task-modal';
import { LinkTaskModal, TaskSuggestion } from '../modals/link-task-modal';

export const TRIAGE_QUEUE_VIEW_TYPE = 'ai-triage-queue-view';

/**
 * Sidebar view for reviewing triaged items
 */
export class TriageQueueView extends ItemView {
	plugin: AITriagePlugin;
	private changeListener = () => this.render();

	constructor(leaf: WorkspaceLeaf, plugin: AITriagePlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return TRIAGE_QUEUE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Triage Queue';
	}

	getIcon(): string {
		return 'inbox';
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('ai-triage-queue-view');

		// Subscribe to queue changes (with null check)
		if (this.plugin.triageQueue) {
			this.plugin.triageQueue.on('change', this.changeListener);
		}

		this.render();
	}

	async onClose(): Promise<void> {
		if (this.plugin.triageQueue) {
			this.plugin.triageQueue.off('change', this.changeListener);
		}
	}

	private render(): void {
		this.contentEl.empty();

		const header = this.contentEl.createDiv({ cls: 'triage-queue-header' });
		header.createEl('h4', { text: 'Triage Queue' });

		// Guard against uninitialized queue
		if (!this.plugin.triageQueue) {
			const errorState = this.contentEl.createDiv({ cls: 'triage-queue-empty' });
			errorState.createEl('p', { text: 'Plugin still initializing...' });
			return;
		}

		const pendingItems = this.plugin.triageQueue.getPendingItems();

		if (pendingItems.length === 0) {
			const emptyState = this.contentEl.createDiv({ cls: 'triage-queue-empty' });
			emptyState.createEl('p', { text: 'No items pending review' });
			emptyState.createEl('p', {
				text: 'New emails and Teams messages will appear here for triage.',
				cls: 'triage-queue-empty-hint'
			});
			return;
		}

		const countEl = header.createEl('span', {
			text: `${pendingItems.length} pending`,
			cls: 'triage-queue-count'
		});

		const listEl = this.contentEl.createDiv({ cls: 'triage-queue-list' });

		for (const item of pendingItems) {
			this.renderTriageItem(listEl, item);
		}
	}

	private renderTriageItem(container: HTMLElement, item: TriageItem): void {
		const itemEl = container.createDiv({ cls: 'triage-item' });
		itemEl.setAttribute('data-id', item.id);

		// Category badge
		const categoryBadge = itemEl.createSpan({
			cls: `triage-category triage-category-${item.suggestion.category.toLowerCase()}`,
			text: this.formatCategory(item.suggestion.category)
		});

		// Title
		const titleEl = itemEl.createDiv({ cls: 'triage-item-title' });
		titleEl.createEl('strong', { text: item.suggestion.title || item.fileName });

		// Client & Priority
		const metaEl = itemEl.createDiv({ cls: 'triage-item-meta' });
		if (item.suggestion.client) {
			metaEl.createSpan({ text: item.suggestion.client, cls: 'triage-client' });
		}
		if (item.suggestion.priority) {
			metaEl.createSpan({
				text: item.suggestion.priority,
				cls: `triage-priority triage-priority-${item.suggestion.priority}`
			});
		}
		if (item.suggestion.dueDate) {
			metaEl.createSpan({ text: `Due: ${item.suggestion.dueDate}`, cls: 'triage-due-date' });
		}

		// Confidence
		const confidenceEl = itemEl.createDiv({ cls: 'triage-confidence' });
		confidenceEl.createSpan({
			text: `Confidence: ${Math.round(item.suggestion.confidence * 100)}%`
		});

		// Reasoning (collapsible)
		if (item.suggestion.reasoning) {
			const reasoningEl = itemEl.createDiv({ cls: 'triage-reasoning' });
			reasoningEl.createEl('small', { text: item.suggestion.reasoning });
		}

		// Category-specific fields
		this.renderCategorySpecificFields(itemEl, item);

		// Action buttons
		const actionsEl = itemEl.createDiv({ cls: 'triage-actions' });

		const createBtn = actionsEl.createEl('button', {
			text: 'Create Task',
			cls: 'triage-action-btn triage-action-create'
		});
		createBtn.addEventListener('click', () => this.handleCreateTask(item));

		const linkBtn = actionsEl.createEl('button', {
			text: 'Link',
			cls: 'triage-action-btn triage-action-link'
		});
		linkBtn.addEventListener('click', () => this.handleLinkToTask(item));

		const dismissBtn = actionsEl.createEl('button', {
			text: 'Dismiss',
			cls: 'triage-action-btn triage-action-dismiss'
		});
		dismissBtn.addEventListener('click', () => this.handleDismiss(item));

		const editBtn = actionsEl.createEl('button', {
			text: 'Edit',
			cls: 'triage-action-btn triage-action-edit'
		});
		editBtn.addEventListener('click', () => this.handleEdit(item));
	}

	private renderCategorySpecificFields(container: HTMLElement, item: TriageItem): void {
		const { suggestion } = item;

		if (suggestion.deliverable) {
			const deliverableEl = container.createDiv({ cls: 'triage-deliverable-fields' });
			deliverableEl.createEl('small', {
				text: `📄 ${suggestion.deliverable.type}${suggestion.deliverable.version ? ` v${suggestion.deliverable.version}` : ''}`
			});
			if (suggestion.deliverable.vendor) {
				deliverableEl.createEl('small', { text: ` • ${suggestion.deliverable.vendor}` });
			}
			if (suggestion.deliverable.reviewDeadline) {
				deliverableEl.createEl('small', { text: ` • Review by: ${suggestion.deliverable.reviewDeadline}` });
			}
		}

		if (suggestion.changeOrder) {
			const coEl = container.createDiv({ cls: 'triage-co-fields' });
			if (suggestion.changeOrder.coNumber) {
				coEl.createEl('small', { text: `📋 ${suggestion.changeOrder.coNumber}` });
			}
			if (suggestion.changeOrder.proposedAmount) {
				coEl.createEl('small', {
					text: ` • $${suggestion.changeOrder.proposedAmount.toLocaleString()}`
				});
			}
		}

		if (suggestion.testing) {
			const testingEl = container.createDiv({ cls: 'triage-testing-fields' });
			if (suggestion.testing.phase) {
				testingEl.createEl('small', { text: `🧪 ${suggestion.testing.phase}` });
			}
			if (suggestion.testing.scheduledStart) {
				testingEl.createEl('small', { text: ` • ${suggestion.testing.scheduledStart}` });
			}
		}

		if (suggestion.interop) {
			const interopEl = container.createDiv({ cls: 'triage-interop-fields' });
			const urgencyClass = suggestion.interop.urgency === 'critical' ? 'urgent' : '';
			interopEl.createEl('small', {
				text: `🔗 ${suggestion.interop.homeAgency || ''} ↔ ${suggestion.interop.awayAgency || ''}`,
				cls: urgencyClass
			});
			if (suggestion.interop.urgency === 'critical') {
				interopEl.createEl('small', { text: ' ⚠️ CRITICAL', cls: 'urgent' });
			}
		}
	}

	private formatCategory(category: TriageCategory): string {
		const labels: Record<TriageCategory, string> = {
			'DELIVERABLE_REVIEW': '📄 Deliverable',
			'CHANGE_ORDER': '📋 Change Order',
			'TESTING_MILESTONE': '🧪 Testing',
			'INTEROPERABILITY_ISSUE': '🔗 Interop',
			'SYSTEM_ISSUE': '⚠️ System Issue',
			'MEETING_FOLLOWUP': '📅 Meeting',
			'VENDOR_CORRESPONDENCE': '📨 Vendor',
			'CLIENT_CORRESPONDENCE': '📨 Client',
			'INFORMATIONAL': 'ℹ️ Info',
			'UNCLEAR': '❓ Review'
		};
		return labels[category] || category;
	}

	private async handleCreateTask(item: TriageItem): Promise<void> {
		try {
			const creator = new TaskNoteCreator(this.app.vault, this.plugin.settings);

			// Merge user edits with suggestion
			const finalSuggestion = {
				...item.suggestion,
				...item.userEdits
			};

			// Get source content for project inference
			const sourceContent = await this.getSourceContent(item.filePath);
			const client = finalSuggestion.client || this.plugin.settings.defaultClient || '';

			// Infer project from content
			const inferredProject = inferProject(sourceContent, client);

			// Get available projects for the client
			const availableProjects = await getProjectsForClient(
				this.app.vault,
				client,
				this.plugin.settings.projectsBasePath
			);

			// Show confirmation modal
			new CreateTaskModal(
				this.app,
				item,
				inferredProject,
				availableProjects,
				async (result: CreateTaskModalResult) => {
					if (!result.confirmed) {
						return;
					}

					// Build overrides from modal result
					const overrides: Partial<typeof finalSuggestion> = {};
					if (result.title) {
						overrides.title = result.title;
					}
					if (result.priority) {
						overrides.priority = result.priority;
					}
					if (result.dueDate) {
						overrides.dueDate = result.dueDate;
					}

					// Create the TaskNote
					const createResult = await creator.createFromTriageItem({
						item,
						project: result.project,
						overrides
					});

					if (!createResult.success) {
						new Notice(`Failed to create task: ${createResult.error}`);
						return;
					}

					// Mark the triage item as reviewed
					await this.plugin.triageQueue.markReviewed(
						item.id,
						'created_task',
						createResult.taskNotePath
					);

					// Open the new TaskNote if setting enabled
					if (this.plugin.settings.openTaskAfterCreation && createResult.taskNotePath) {
						const file = this.app.vault.getAbstractFileByPath(createResult.taskNotePath);
						if (file instanceof TFile) {
							await this.app.workspace.getLeaf().openFile(file);
						}
					}

					new Notice(`Created: ${createResult.taskNotePath}`);
				}
			).open();
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error('Failed to create task:', error);
			new Notice(`Error creating task: ${errorMessage}`);
		}
	}

	/**
	 * Get the content of a source file
	 */
	private async getSourceContent(filePath: string): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) {
			return await this.app.vault.read(file);
		}
		return '';
	}

	private async handleLinkToTask(item: TriageItem): Promise<void> {
		try {
			const modal = new LinkTaskModal(
				this.app,
				this.plugin.settings.taskNotesFolder,
				async (selectedTask: TaskSuggestion) => {
					try {
						// Validate file still exists
						const taskFile = this.app.vault.getAbstractFileByPath(selectedTask.file.path);
						if (!(taskFile instanceof TFile)) {
							new Notice(`Task file no longer exists: ${selectedTask.file.path}`);
							return;
						}

						// Append link to TaskNote (with duplicate check, returns false if duplicate)
						const linkAdded = await this.appendLinkToTaskNote(taskFile, item);
						if (!linkAdded) {
							return; // Duplicate - notice already shown
						}

						// Mark reviewed only after successful link
						await this.plugin.triageQueue.markReviewed(
							item.id,
							'linked_task',
							selectedTask.file.path
						);

						new Notice(`Linked to: ${selectedTask.title}`);
					} catch (error) {
						const msg = error instanceof Error ? error.message : String(error);
						console.error('Failed to link to task:', error);
						new Notice(`Error linking: ${msg}`);
					}
				}
			);
			modal.open();
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			console.error('Failed to open link modal:', error);
			new Notice(`Error: ${msg}`);
		}
	}

	/**
	 * Append a link to the source file in the TaskNote's "Linked Items" section
	 * Uses vault.process() for atomic read-modify-write
	 * @returns true if link was added, false if it was a duplicate
	 */
	private async appendLinkToTaskNote(taskFile: TFile, item: TriageItem): Promise<boolean> {
		// Handle any file extension, not just .md
		const sourceLink = item.fileName.replace(/\.[^/.]+$/, '');

		let linkAdded = false;

		// Use vault.process() for atomic read-modify-write
		await this.app.vault.process(taskFile, (content) => {
			// Check for duplicate link (handles [[link]] and [[link|alias]] formats)
			const escapedLink = sourceLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const linkPattern = new RegExp(`\\[\\[${escapedLink}(\\|[^\\]]*)?\\]\\]`);
			if (linkPattern.test(content)) {
				new Notice(`Already linked: ${sourceLink}`);
				return content; // Return unchanged
			}

			const today = new Date().toISOString().split('T')[0];
			const linkLine = `- [[${sourceLink}]] (linked ${today})`;
			linkAdded = true;

			// Robust heading detection (handles ## or ### with optional whitespace)
			const headingMatch = content.match(/^(#{1,6}\s*Linked Items\s*)$/m);
			if (headingMatch) {
				// Insert after the heading
				return content.replace(headingMatch[0], `${headingMatch[0]}\n${linkLine}`);
			} else {
				// Append new section at the end
				return content.trimEnd() + `\n\n## Linked Items\n\n${linkLine}\n`;
			}
		});

		return linkAdded;
	}

	private async handleDismiss(item: TriageItem): Promise<void> {
		await this.plugin.triageQueue.dismissItem(item.id);
	}

	private async handleEdit(item: TriageItem): Promise<void> {
		// TODO: Implement inline editing modal
		console.log('Edit item:', item);
	}
}
