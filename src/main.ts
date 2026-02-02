import { Plugin, Notice, WorkspaceLeaf, TFile } from 'obsidian';
import { AITriageSettings, DEFAULT_SETTINGS, AITriageSettingTab } from './settings';
import { OllamaClient } from './ollama-client';
import { TriageQueue } from './triage-queue';
import { RateLimitedWatcher } from './file-watcher';
import { StateLoader } from './state-loader';
import { WeeklyReportGenerator, isReportGenerationTime } from './weekly-report-generator';
import { PRIORITY_DASHBOARD_VIEW_TYPE, PriorityDashboardView } from './views/priority-dashboard-view';
import { CHAT_SIDEBAR_VIEW_TYPE, ChatSidebarView } from './views/chat-sidebar-view';

// Keep legacy view type for graceful migration
export const TRIAGE_QUEUE_VIEW_TYPE = 'ai-triage-queue-view';

export default class AITriagePlugin extends Plugin {
	settings: AITriageSettings;
	ollama: OllamaClient;
	stateLoader: StateLoader;
	weeklyReportGenerator: WeeklyReportGenerator;
	statusBarEl: HTMLElement;
	private reportCheckInterval: number | null = null;
	private lastReportCheckHour: number = -1;

	// Legacy: kept for backwards compatibility
	triageQueue: TriageQueue;
	fileWatcher: RateLimitedWatcher;

	async onload() {
		console.log('Loading Priority Dashboard plugin');

		try {
			await this.loadSettings();
		} catch (error) {
			console.error('Priority Dashboard: Failed to load settings:', error);
			new Notice('Priority Dashboard: Failed to load settings');
			return;
		}

		// Initialize state loader for dashboard
		this.stateLoader = new StateLoader(this.app.vault);

		// Initialize weekly report generator
		this.weeklyReportGenerator = new WeeklyReportGenerator(
			this.app.vault,
			this.settings.weeklyReportsFolder
		);

		// Initialize Ollama client (for future chat feature)
		try {
			this.ollama = new OllamaClient(this.settings);
		} catch (error) {
			console.error('Priority Dashboard: Failed to initialize Ollama client:', error);
			// Non-blocking - dashboard doesn't need Ollama
		}

		// Legacy: Initialize triage queue (kept for backwards compatibility)
		try {
			this.triageQueue = new TriageQueue(this);
			await this.triageQueue.load();
		} catch (error) {
			console.error('Priority Dashboard: Failed to load triage queue:', error);
			this.triageQueue = new TriageQueue(this);
		}

		// Legacy: Initialize file watcher (kept for backwards compatibility)
		try {
			this.fileWatcher = new RateLimitedWatcher(this, this.ollama, this.triageQueue);
		} catch (error) {
			console.error('Priority Dashboard: Failed to initialize file watcher:', error);
		}

		// Register Priority Dashboard view
		this.registerView(
			PRIORITY_DASHBOARD_VIEW_TYPE,
			(leaf) => new PriorityDashboardView(leaf, this)
		);

		// Register Chat Sidebar view (for future use)
		this.registerView(
			CHAT_SIDEBAR_VIEW_TYPE,
			(leaf) => new ChatSidebarView(leaf, this)
		);

		// Add ribbon icon for priority dashboard
		this.addRibbonIcon('target', 'Open Priority Dashboard', () => {
			this.activateDashboardView();
		});

		// Status bar for quick stats
		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.addEventListener('click', () => {
			this.activateDashboardView();
		});
		this.updateStatusBar();

		// Register commands
		this.addCommand({
			id: 'open-priority-dashboard',
			name: 'Open Priority Dashboard',
			callback: () => this.activateDashboardView(),
		});

		this.addCommand({
			id: 'refresh-dashboard',
			name: 'Refresh Priority Dashboard',
			callback: async () => {
				// Find existing dashboard view and refresh it
				const leaves = this.app.workspace.getLeavesOfType(PRIORITY_DASHBOARD_VIEW_TYPE);
				const leaf = leaves[0];
				if (leaf) {
					const view = leaf.view as PriorityDashboardView;
					await view.refreshDashboard();
					new Notice('Dashboard refreshed');
				} else {
					// Open dashboard if not open
					await this.activateDashboardView();
				}
			},
		});

		this.addCommand({
			id: 'open-chat-sidebar',
			name: 'Chat about current note',
			callback: () => this.activateChatSidebar(),
		});

		this.addCommand({
			id: 'generate-weekly-pip-report',
			name: 'Generate Weekly PIP Report',
			callback: () => this.generateWeeklyReport(),
		});

		// Legacy command (kept for backwards compatibility)
		this.addCommand({
			id: 'test-ollama-connection',
			name: 'Test Ollama Connection',
			callback: async () => {
				if (!this.ollama) {
					new Notice('Ollama client not initialized');
					return;
				}
				const result = await this.ollama.testConnection();
				if (result.success) {
					new Notice(`Ollama connected: ${result.model}`);
				} else {
					new Notice(`Ollama error: ${result.error}`);
				}
			},
		});

		// Add settings tab
		this.addSettingTab(new AITriageSettingTab(this.app, this));

		// Legacy: Start file watcher if enabled (but disabled by default now)
		if (this.settings.autoTriageEnabled && this.fileWatcher) {
			setTimeout(() => {
				this.fileWatcher?.start();
			}, 1000);
		}

		// Set up hourly check for weekly report generation
		if (this.settings.autoGenerateWeeklyReport) {
			this.startReportScheduler();
		}

		console.log('Priority Dashboard plugin loaded successfully');
	}

	onunload() {
		console.log('Unloading Priority Dashboard plugin');
		this.fileWatcher?.stop();
		this.stopReportScheduler();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Update services with new settings
		this.ollama?.updateSettings(this.settings);
		this.fileWatcher?.updateSettings(this.settings);
		this.weeklyReportGenerator?.updateReportsFolder(this.settings.weeklyReportsFolder);

		// Update scheduler based on settings
		if (this.settings.autoGenerateWeeklyReport) {
			this.startReportScheduler();
		} else {
			this.stopReportScheduler();
		}
	}

	async updateStatusBar() {
		if (!this.statusBarEl) return;

		try {
			// Load state to get quick stats
			const state = await this.stateLoader.loadState(this.settings.stateFilePath);

			if (state.error) {
				this.statusBarEl.setText('');
				return;
			}

			const overdue = state.summaryStats.overdueCount;
			if (overdue > 0) {
				this.statusBarEl.setText(`${overdue} overdue`);
				this.statusBarEl.addClass('ai-dashboard-overdue');
			} else {
				this.statusBarEl.setText('');
				this.statusBarEl.removeClass('ai-dashboard-overdue');
			}
		} catch (error) {
			// Silently fail - status bar is non-critical
			this.statusBarEl.setText('');
		}
	}

	async activateDashboardView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | undefined;
		const leaves = workspace.getLeavesOfType(PRIORITY_DASHBOARD_VIEW_TYPE);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				await rightLeaf.setViewState({ type: PRIORITY_DASHBOARD_VIEW_TYPE, active: true });
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

	/**
	 * Generate a weekly PIP report manually
	 */
	async generateWeeklyReport(): Promise<void> {
		try {
			// Load current state
			const state = await this.stateLoader.loadState(this.settings.stateFilePath);

			if (state.error) {
				new Notice(`Cannot generate report: ${state.error}`);
				return;
			}

			// Generate the report
			const result = await this.weeklyReportGenerator.generateReport(state);

			if (result.success && result.filePath) {
				new Notice(`Weekly report generated: ${result.filePath}`);

				// Open the report if setting is enabled
				if (this.settings.openTaskAfterCreation) {
					const file = this.app.vault.getAbstractFileByPath(result.filePath);
					if (file instanceof TFile) {
						await this.app.workspace.getLeaf().openFile(file);
					}
				}
			} else if (result.alreadyExists) {
				new Notice(`Report already exists for this week`);
			} else if (result.pipNotActive) {
				new Notice('PIP tracking is not active');
			} else {
				new Notice(`Failed to generate report: ${result.error}`);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Error generating report: ${message}`);
			console.error('Weekly report generation error:', error);
		}
	}

	/**
	 * Start the hourly scheduler for auto-generating weekly reports
	 */
	private startReportScheduler(): void {
		// Clear existing interval if any
		this.stopReportScheduler();

		// Check every hour (3600000ms)
		this.reportCheckInterval = window.setInterval(
			() => this.checkAndGenerateReport(),
			60 * 60 * 1000
		);
		this.registerInterval(this.reportCheckInterval);

		// Also do an immediate check
		this.checkAndGenerateReport();
	}

	/**
	 * Stop the report scheduler
	 */
	private stopReportScheduler(): void {
		if (this.reportCheckInterval !== null) {
			window.clearInterval(this.reportCheckInterval);
			this.reportCheckInterval = null;
		}
	}

	/**
	 * Check if it's time to generate a report and do so if needed
	 */
	private async checkAndGenerateReport(): Promise<void> {
		// Get current Eastern hour
		const now = new Date();
		const easternStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
		const eastern = new Date(easternStr);
		const currentHour = eastern.getHours();

		// Only check once per hour (avoid duplicate generation)
		if (currentHour === this.lastReportCheckHour) {
			return;
		}
		this.lastReportCheckHour = currentHour;

		// Check if it's report generation time
		if (!isReportGenerationTime(
			this.settings.reportGenerationDay,
			this.settings.reportGenerationHour
		)) {
			return;
		}

		// Check if report already exists for this week
		if (await this.weeklyReportGenerator.reportExistsForWeek()) {
			return;
		}

		// Load state and generate report
		try {
			const state = await this.stateLoader.loadState(this.settings.stateFilePath);

			if (state.error || !state.pipStatus?.active) {
				return; // Silently skip if state can't be loaded or PIP not active
			}

			const result = await this.weeklyReportGenerator.generateReport(state);

			if (result.success) {
				new Notice(`Weekly PIP report auto-generated: ${result.filePath}`);
			}
		} catch (error) {
			console.error('Auto-generation of weekly report failed:', error);
		}
	}
}
