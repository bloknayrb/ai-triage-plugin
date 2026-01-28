import { Plugin, Notice, WorkspaceLeaf } from 'obsidian';
import { AITriageSettings, DEFAULT_SETTINGS, AITriageSettingTab } from './settings';
import { OllamaClient } from './ollama-client';
import { TriageQueue } from './triage-queue';
import { RateLimitedWatcher } from './file-watcher';
import { TRIAGE_QUEUE_VIEW_TYPE, TriageQueueView } from './views/triage-queue-view';
import { CHAT_SIDEBAR_VIEW_TYPE, ChatSidebarView } from './views/chat-sidebar-view';

export default class AITriagePlugin extends Plugin {
	settings: AITriageSettings;
	ollama: OllamaClient;
	triageQueue: TriageQueue;
	fileWatcher: RateLimitedWatcher;
	statusBarEl: HTMLElement;

	async onload() {
		console.log('Loading AI Triage plugin');

		try {
			await this.loadSettings();
		} catch (error) {
			console.error('AI Triage: Failed to load settings:', error);
			new Notice('AI Triage: Failed to load settings');
			return;
		}

		// Initialize core services with error handling
		try {
			this.ollama = new OllamaClient(this.settings);
		} catch (error) {
			console.error('AI Triage: Failed to initialize Ollama client:', error);
			new Notice('AI Triage: Failed to initialize Ollama client');
		}

		try {
			this.triageQueue = new TriageQueue(this);
			await this.triageQueue.load();
		} catch (error) {
			console.error('AI Triage: Failed to load triage queue:', error);
			new Notice('AI Triage: Failed to load triage queue');
			// Create empty queue so plugin can still load
			this.triageQueue = new TriageQueue(this);
		}

		// Initialize file watcher
		try {
			this.fileWatcher = new RateLimitedWatcher(this, this.ollama, this.triageQueue);
		} catch (error) {
			console.error('AI Triage: Failed to initialize file watcher:', error);
		}

		// Register views - these should never fail
		this.registerView(
			TRIAGE_QUEUE_VIEW_TYPE,
			(leaf) => new TriageQueueView(leaf, this)
		);

		this.registerView(
			CHAT_SIDEBAR_VIEW_TYPE,
			(leaf) => new ChatSidebarView(leaf, this)
		);

		// Add ribbon icon for triage queue
		this.addRibbonIcon('inbox', 'Open Triage Queue', () => {
			this.activateTriageQueueView();
		});

		// Status bar for pending items count
		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.addEventListener('click', () => {
			this.activateTriageQueueView();
		});
		this.updateStatusBar();

		// Register commands
		this.addCommand({
			id: 'open-triage-queue',
			name: 'Open Triage Queue',
			callback: () => this.activateTriageQueueView(),
		});

		this.addCommand({
			id: 'open-chat-sidebar',
			name: 'Chat about current note',
			callback: () => this.activateChatSidebar(),
		});

		this.addCommand({
			id: 'generate-weekly-report',
			name: 'Generate Weekly Report',
			callback: () => this.generateWeeklyReport(),
		});

		this.addCommand({
			id: 'test-ollama-connection',
			name: 'Test Ollama Connection',
			callback: async () => {
				if (!this.ollama) {
					new Notice('✗ Ollama client not initialized');
					return;
				}
				const result = await this.ollama.testConnection();
				if (result.success) {
					new Notice(`✓ Ollama connected: ${result.model}`);
				} else {
					new Notice(`✗ Ollama error: ${result.error}`);
				}
			},
		});

		// Add settings tab
		this.addSettingTab(new AITriageSettingTab(this.app, this));

		// Start file watcher if enabled (delay slightly to avoid blocking workspace load)
		if (this.settings.autoTriageEnabled && this.fileWatcher) {
			setTimeout(() => {
				this.fileWatcher?.start();
			}, 1000);
		}

		// Subscribe to queue changes for status bar updates
		if (this.triageQueue) {
			this.triageQueue.on('change', () => this.updateStatusBar());
		}

		console.log('AI Triage plugin loaded successfully');
	}

	onunload() {
		console.log('Unloading AI Triage plugin');
		this.fileWatcher?.stop();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Update services with new settings
		this.ollama?.updateSettings(this.settings);
		this.fileWatcher?.updateSettings(this.settings);
	}

	updateStatusBar() {
		if (!this.statusBarEl) return;

		const pendingCount = this.triageQueue?.getPendingCount() ?? 0;
		if (pendingCount > 0) {
			this.statusBarEl.setText(`📥 ${pendingCount} pending`);
			this.statusBarEl.addClass('ai-triage-pending');
		} else {
			this.statusBarEl.setText('');
			this.statusBarEl.removeClass('ai-triage-pending');
		}
	}

	async activateTriageQueueView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | undefined;
		const leaves = workspace.getLeavesOfType(TRIAGE_QUEUE_VIEW_TYPE);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				await rightLeaf.setViewState({ type: TRIAGE_QUEUE_VIEW_TYPE, active: true });
				leaf = rightLeaf;
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	async activateChatSidebar() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | undefined;
		const leaves = workspace.getLeavesOfType(CHAT_SIDEBAR_VIEW_TYPE);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				await rightLeaf.setViewState({ type: CHAT_SIDEBAR_VIEW_TYPE, active: true });
				leaf = rightLeaf;
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	async generateWeeklyReport() {
		new Notice('Generating weekly report...');
		// TODO: Implement weekly report generation
		new Notice('Weekly report feature coming soon');
	}
}
