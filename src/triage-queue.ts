import AITriagePlugin from './main';

export type TriageCategory =
	| 'DELIVERABLE_REVIEW'
	| 'CHANGE_ORDER'
	| 'TESTING_MILESTONE'
	| 'INTEROPERABILITY_ISSUE'
	| 'SYSTEM_ISSUE'
	| 'MEETING_FOLLOWUP'
	| 'VENDOR_CORRESPONDENCE'
	| 'CLIENT_CORRESPONDENCE'
	| 'INFORMATIONAL'
	| 'UNCLEAR';

export type TriageItemStatus = 'pending' | 'reviewed' | 'dismissed';

export interface TriageSuggestion {
	category: TriageCategory;
	title: string;
	client?: string;
	priority?: 'critical' | 'high' | 'medium' | 'low';
	dueDate?: string;
	tags?: string[];
	confidence: number;
	reasoning?: string;

	// Deliverable-specific
	deliverable?: {
		type: string;
		version?: string;
		vendor?: string;
		reviewDeadline?: string;
	};

	// Change order-specific
	changeOrder?: {
		coNumber?: string;
		proposedAmount?: number;
		affectedSystems?: string[];
	};

	// Testing-specific
	testing?: {
		phase?: string;
		scheduledStart?: string;
		scheduledEnd?: string;
	};

	// Interoperability-specific
	interop?: {
		homeAgency?: string;
		awayAgency?: string;
		urgency?: 'critical' | 'elevated' | 'standard';
	};
}

export interface TriageItem {
	id: string;
	filePath: string;
	fileName: string;
	triageTime: string;
	suggestion: TriageSuggestion;
	status: TriageItemStatus;
	userEdits?: Partial<TriageSuggestion>;
	actionTaken?: string;
	actionTime?: string;
	createdTaskPath?: string; // Path to TaskNote if created
}

interface TriageQueueData {
	items: TriageItem[];
	lastUpdated: string;
}

type ChangeListener = () => void;

/**
 * Persistent queue for triaged items awaiting user review
 */
export class TriageQueue {
	private plugin: AITriagePlugin;
	private items: TriageItem[] = [];
	private listeners: ChangeListener[] = [];
	private readonly dataFileName = 'triage-queue.json';

	constructor(plugin: AITriagePlugin) {
		this.plugin = plugin;
	}

	/**
	 * Load queue from persistent storage
	 */
	async load(): Promise<void> {
		try {
			const data = await this.plugin.loadData();
			if (data?.triageQueue?.items) {
				this.items = data.triageQueue.items;
			}
		} catch (error) {
			console.error('Failed to load triage queue:', error);
			this.items = [];
		}
	}

	/**
	 * Save queue to persistent storage
	 */
	async save(): Promise<void> {
		try {
			const data = await this.plugin.loadData() || {};
			data.triageQueue = {
				items: this.items,
				lastUpdated: new Date().toISOString()
			} as TriageQueueData;
			await this.plugin.saveData(data);
		} catch (error) {
			console.error('Failed to save triage queue:', error);
		}
	}

	/**
	 * Generate a unique ID for a triage item
	 */
	private generateId(): string {
		return `triage-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
	}

	/**
	 * Add a new item to the queue
	 */
	async addItem(filePath: string, suggestion: TriageSuggestion): Promise<TriageItem> {
		const item: TriageItem = {
			id: this.generateId(),
			filePath,
			fileName: filePath.split('/').pop() || filePath,
			triageTime: new Date().toISOString(),
			suggestion,
			status: 'pending'
		};

		this.items.push(item);
		await this.save();
		this.notifyListeners();

		return item;
	}

	/**
	 * Update an existing item
	 */
	async updateItem(id: string, updates: Partial<TriageItem>): Promise<TriageItem | null> {
		const index = this.items.findIndex(item => item.id === id);
		if (index === -1) return null;

		const existingItem = this.items[index];
		if (!existingItem) return null;

		const updatedItem: TriageItem = {
			id: existingItem.id,
			filePath: updates.filePath ?? existingItem.filePath,
			fileName: updates.fileName ?? existingItem.fileName,
			triageTime: updates.triageTime ?? existingItem.triageTime,
			suggestion: updates.suggestion ?? existingItem.suggestion,
			status: updates.status ?? existingItem.status,
			userEdits: updates.userEdits ?? existingItem.userEdits,
			actionTaken: updates.actionTaken ?? existingItem.actionTaken,
			actionTime: updates.actionTime ?? existingItem.actionTime,
			createdTaskPath: updates.createdTaskPath ?? existingItem.createdTaskPath
		};
		this.items[index] = updatedItem;
		await this.save();
		this.notifyListeners();

		return updatedItem;
	}

	/**
	 * Remove an item from the queue
	 */
	async removeItem(id: string): Promise<boolean> {
		const index = this.items.findIndex(item => item.id === id);
		if (index === -1) return false;

		this.items.splice(index, 1);
		await this.save();
		this.notifyListeners();

		return true;
	}

	/**
	 * Mark an item as reviewed with an action
	 * @param id - The triage item ID
	 * @param action - The action taken (e.g., 'created_task', 'linked_task', 'dismissed')
	 * @param taskPath - Optional path to the created/linked TaskNote
	 */
	async markReviewed(id: string, action: string, taskPath?: string): Promise<TriageItem | null> {
		return this.updateItem(id, {
			status: 'reviewed',
			actionTaken: action,
			actionTime: new Date().toISOString(),
			createdTaskPath: taskPath
		});
	}

	/**
	 * Dismiss an item (informational, no action needed)
	 */
	async dismissItem(id: string): Promise<TriageItem | null> {
		return this.updateItem(id, {
			status: 'dismissed',
			actionTaken: 'dismissed',
			actionTime: new Date().toISOString()
		});
	}

	/**
	 * Get an item by ID
	 */
	getItem(id: string): TriageItem | undefined {
		return this.items.find(item => item.id === id);
	}

	/**
	 * Get all pending items
	 */
	getPendingItems(): TriageItem[] {
		return this.items.filter(item => item.status === 'pending');
	}

	/**
	 * Get count of pending items
	 */
	getPendingCount(): number {
		return this.items.filter(item => item.status === 'pending').length;
	}

	/**
	 * Get all items
	 */
	getAllItems(): TriageItem[] {
		return [...this.items];
	}

	/**
	 * Get items by category
	 */
	getItemsByCategory(category: TriageCategory): TriageItem[] {
		return this.items.filter(item => item.suggestion.category === category);
	}

	/**
	 * Check if a file path is already in the queue
	 */
	hasFilePath(filePath: string): boolean {
		return this.items.some(item => item.filePath === filePath && item.status === 'pending');
	}

	/**
	 * Clear all dismissed/reviewed items (cleanup)
	 */
	async clearProcessed(): Promise<number> {
		const beforeCount = this.items.length;
		this.items = this.items.filter(item => item.status === 'pending');
		const removed = beforeCount - this.items.length;

		if (removed > 0) {
			await this.save();
			this.notifyListeners();
		}

		return removed;
	}

	/**
	 * Subscribe to queue changes
	 */
	on(event: 'change', listener: ChangeListener): void {
		if (event === 'change') {
			this.listeners.push(listener);
		}
	}

	/**
	 * Unsubscribe from queue changes
	 */
	off(event: 'change', listener: ChangeListener): void {
		if (event === 'change') {
			const index = this.listeners.indexOf(listener);
			if (index !== -1) {
				this.listeners.splice(index, 1);
			}
		}
	}

	/**
	 * Notify all listeners of a change
	 */
	private notifyListeners(): void {
		for (const listener of this.listeners) {
			try {
				listener();
			} catch (error) {
				console.error('Triage queue listener error:', error);
			}
		}
	}
}
