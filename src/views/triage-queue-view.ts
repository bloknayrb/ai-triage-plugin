import { ItemView, WorkspaceLeaf } from 'obsidian';
import AITriagePlugin from '../main';
import { TriageItem, TriageCategory } from '../triage-queue';

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

		// Subscribe to queue changes
		this.plugin.triageQueue.on('change', this.changeListener);

		this.render();
	}

	async onClose(): Promise<void> {
		this.plugin.triageQueue.off('change', this.changeListener);
	}

	private render(): void {
		this.contentEl.empty();

		const header = this.contentEl.createDiv({ cls: 'triage-queue-header' });
		header.createEl('h4', { text: 'Triage Queue' });

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
		// TODO: Implement TaskNote creation
		console.log('Create task for:', item);
		await this.plugin.triageQueue.markReviewed(item.id, 'created_task');
	}

	private async handleLinkToTask(item: TriageItem): Promise<void> {
		// TODO: Implement task linking modal
		console.log('Link to task:', item);
	}

	private async handleDismiss(item: TriageItem): Promise<void> {
		await this.plugin.triageQueue.dismissItem(item.id);
	}

	private async handleEdit(item: TriageItem): Promise<void> {
		// TODO: Implement inline editing modal
		console.log('Edit item:', item);
	}
}
