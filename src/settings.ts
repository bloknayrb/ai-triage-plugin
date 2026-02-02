import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import AITriagePlugin from './main';
import { FolderSuggestModal } from './modals/folder-suggest-modal';

export interface AITriageSettings {
	// === Priority Dashboard Settings ===
	stateFilePath: string;
	showPipCoaching: boolean;
	autoRefreshDashboard: boolean;

	// === Weekly PIP Reports ===
	weeklyReportsFolder: string;
	autoGenerateWeeklyReport: boolean;
	reportGenerationDay: 'sunday' | 'monday';
	reportGenerationHour: number;

	// === TaskNote Creation ===
	taskNotesFolder: string;
	projectsBasePath: string;
	openTaskAfterCreation: boolean;

	// === Client/Vendor Configuration ===
	defaultClient: string;
	vendorEmailDomains: Record<string, string>;

	// === UI Preferences ===
	showToastNotifications: boolean;

	// === Advanced: Ollama Configuration (for future chat feature) ===
	ollamaBaseUrl: string;
	triageModel: string;
	embeddingModel: string;
	requestTimeout: number;

	// === Legacy: Triage Settings (kept for backwards compatibility) ===
	watchedFolders: string[];
	sensitivePatterns: string[];
	skipTaggedFiles: string[];
	autoTriageEnabled: boolean;
	teamsBatchDelayMinutes: number;
	maxConcurrentTriages: number;
	debounceDelayMs: number;
	scanLookbackDays: number;
	autoIndexTeamsToSimpleMem: boolean;
	simpleMemBatchWindowMinutes: number;
	triageContextPath: string;
}

export const DEFAULT_SETTINGS: AITriageSettings = {
	// Priority Dashboard
	stateFilePath: '99-System/Claude-State-Tracking.md',
	showPipCoaching: true,
	autoRefreshDashboard: true,

	// Weekly PIP Reports
	weeklyReportsFolder: 'WeeklyReports',
	autoGenerateWeeklyReport: true,
	reportGenerationDay: 'monday',
	reportGenerationHour: 9,

	// TaskNote Creation
	taskNotesFolder: 'TaskNotes',
	projectsBasePath: '01-Projects',
	openTaskAfterCreation: true,

	// Client configuration
	defaultClient: '',
	vendorEmailDomains: {
		'transcore.com': 'TransCore',
		'conduent.com': 'Conduent',
		'kapsch.net': 'Kapsch',
		'neology.net': 'Neology'
	},

	// UI
	showToastNotifications: true,

	// Advanced: Ollama - hardcoded to localhost only for security
	ollamaBaseUrl: 'http://127.0.0.1:11434',
	triageModel: 'gemma3:latest',
	embeddingModel: 'qwen3-embedding:8b',
	requestTimeout: 30000,

	// Legacy: Triage settings (kept for backwards compatibility)
	watchedFolders: [
		'Emails/',
		'TeamsChats/',
		'Calendar/'
	],
	sensitivePatterns: ['#confidential', '#sensitive', '#private'],
	skipTaggedFiles: ['confidential', 'sensitive', 'private'],
	autoTriageEnabled: false, // Disabled by default now
	teamsBatchDelayMinutes: 5,
	maxConcurrentTriages: 2,
	debounceDelayMs: 1000,
	scanLookbackDays: 7,
	autoIndexTeamsToSimpleMem: true,
	simpleMemBatchWindowMinutes: 5,
	triageContextPath: 'triage-context.md'
};

export class AITriageSettingTab extends PluginSettingTab {
	plugin: AITriagePlugin;

	constructor(app: App, plugin: AITriagePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h1', { text: 'Priority Dashboard Settings' });

		// --- Priority Dashboard ---
		containerEl.createEl('h2', { text: 'Dashboard' });

		new Setting(containerEl)
			.setName('State file path')
			.setDesc('Path to Claude-State-Tracking.md (the file containing your tracked tasks and priorities)')
			.addText(text => text
				.setPlaceholder('99-System/Claude-State-Tracking.md')
				.setValue(this.plugin.settings.stateFilePath)
				.onChange(async (value) => {
					this.plugin.settings.stateFilePath = value || '99-System/Claude-State-Tracking.md';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Show PIP coaching')
			.setDesc('Display PIP status banner, habit tracker, and EOD reminders')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showPipCoaching)
				.onChange(async (value) => {
					this.plugin.settings.showPipCoaching = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-refresh dashboard')
			.setDesc('Automatically refresh the dashboard every 5 minutes')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoRefreshDashboard)
				.onChange(async (value) => {
					this.plugin.settings.autoRefreshDashboard = value;
					await this.plugin.saveSettings();
				}));

		// --- Weekly PIP Reports ---
		containerEl.createEl('h2', { text: 'Weekly PIP Reports' });

		new Setting(containerEl)
			.setName('Weekly reports folder')
			.setDesc('Folder where weekly PIP reports are saved')
			.addText(text => text
				.setPlaceholder('WeeklyReports')
				.setValue(this.plugin.settings.weeklyReportsFolder)
				.onChange(async (value) => {
					this.plugin.settings.weeklyReportsFolder = value || 'WeeklyReports';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-generate weekly report')
			.setDesc('Automatically generate a weekly report at the scheduled time')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoGenerateWeeklyReport)
				.onChange(async (value) => {
					this.plugin.settings.autoGenerateWeeklyReport = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Report generation day')
			.setDesc('Day of the week to generate reports (summarizes the previous week)')
			.addDropdown(dropdown => dropdown
				.addOptions({
					'monday': 'Monday',
					'sunday': 'Sunday'
				})
				.setValue(this.plugin.settings.reportGenerationDay)
				.onChange(async (value: 'monday' | 'sunday') => {
					this.plugin.settings.reportGenerationDay = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Report generation hour')
			.setDesc('Hour of the day to generate reports (24-hour format, Eastern Time)')
			.addDropdown(dropdown => {
				for (let i = 0; i < 24; i++) {
					const label = i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`;
					dropdown.addOption(String(i), label);
				}
				dropdown.setValue(String(this.plugin.settings.reportGenerationHour))
					.onChange(async (value) => {
						this.plugin.settings.reportGenerationHour = parseInt(value, 10);
						await this.plugin.saveSettings();
					});
				return dropdown;
			});

		// --- TaskNote Settings ---
		containerEl.createEl('h2', { text: 'TaskNotes' });

		new Setting(containerEl)
			.setName('TaskNotes folder')
			.setDesc('Folder where TaskNotes are stored (for opening tasks from dashboard)')
			.addText(text => text
				.setPlaceholder('TaskNotes')
				.setValue(this.plugin.settings.taskNotesFolder)
				.onChange(async (value) => {
					this.plugin.settings.taskNotesFolder = value || 'TaskNotes';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Projects base path')
			.setDesc('Base folder for project discovery (e.g., 01-Projects)')
			.addText(text => text
				.setPlaceholder('01-Projects')
				.setValue(this.plugin.settings.projectsBasePath)
				.onChange(async (value) => {
					this.plugin.settings.projectsBasePath = value || '01-Projects';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Open task after creation')
			.setDesc('Automatically open the TaskNote after creating it')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.openTaskAfterCreation)
				.onChange(async (value) => {
					this.plugin.settings.openTaskAfterCreation = value;
					await this.plugin.saveSettings();
				}));

		// --- Client/Vendor Configuration ---
		containerEl.createEl('h2', { text: 'Client Configuration' });

		new Setting(containerEl)
			.setName('Default client')
			.setDesc('Default client for new tasks when not detected (optional)')
			.addDropdown(dropdown => dropdown
				.addOptions({
					'': '(None)',
					'DRPA': 'DRPA',
					'VDOT': 'VDOT',
					'MDTA': 'MDTA',
					'DelDOT': 'DelDOT'
				})
				.setValue(this.plugin.settings.defaultClient)
				.onChange(async (value) => {
					this.plugin.settings.defaultClient = value;
					await this.plugin.saveSettings();
				}));

		// --- UI Preferences ---
		containerEl.createEl('h2', { text: 'UI Preferences' });

		new Setting(containerEl)
			.setName('Show toast notifications')
			.setDesc('Show notifications for dashboard actions')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showToastNotifications)
				.onChange(async (value) => {
					this.plugin.settings.showToastNotifications = value;
					await this.plugin.saveSettings();
				}));

		// --- Advanced Settings (collapsed by default) ---
		const advancedSection = containerEl.createEl('details');
		advancedSection.createEl('summary', { text: 'Advanced Settings', cls: 'settings-advanced-toggle' });

		advancedSection.createEl('h3', { text: 'Ollama Configuration (for future chat feature)' });

		new Setting(advancedSection)
			.setName('Ollama URL')
			.setDesc('Local Ollama server URL (security: only 127.0.0.1 allowed)')
			.addText(text => text
				.setPlaceholder('http://127.0.0.1:11434')
				.setValue(this.plugin.settings.ollamaBaseUrl)
				.setDisabled(true) // Hardcoded for security
			);

		new Setting(advancedSection)
			.setName('Triage model')
			.setDesc('Model for classification and chat (e.g., gemma3:latest)')
			.addText(text => text
				.setPlaceholder('gemma3:latest')
				.setValue(this.plugin.settings.triageModel)
				.onChange(async (value) => {
					this.plugin.settings.triageModel = value;
					await this.plugin.saveSettings();
				}));

		new Setting(advancedSection)
			.setName('Embedding model')
			.setDesc('Model for semantic search (e.g., qwen3-embedding:8b)')
			.addText(text => text
				.setPlaceholder('qwen3-embedding:8b')
				.setValue(this.plugin.settings.embeddingModel)
				.onChange(async (value) => {
					this.plugin.settings.embeddingModel = value;
					await this.plugin.saveSettings();
				}));

		new Setting(advancedSection)
			.setName('Request timeout')
			.setDesc('Timeout for Ollama requests in milliseconds')
			.addText(text => text
				.setPlaceholder('30000')
				.setValue(String(this.plugin.settings.requestTimeout))
				.onChange(async (value) => {
					const num = parseInt(value, 10);
					if (!isNaN(num) && num > 0) {
						this.plugin.settings.requestTimeout = num;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(advancedSection)
			.setName('Test connection')
			.setDesc('Verify Ollama is running and accessible')
			.addButton(button => button
				.setButtonText('Test')
				.onClick(async () => {
					if (!this.plugin.ollama) {
						new Notice('Ollama client not initialized');
						return;
					}
					button.setDisabled(true);
					button.setButtonText('Testing...');
					const result = await this.plugin.ollama.testConnection();
					if (result.success) {
						new Notice(`Connected to Ollama (${result.model})`);
					} else {
						new Notice(`Connection failed: ${result.error}`);
					}
					button.setButtonText('Test');
					button.setDisabled(false);
				}));

		// --- Legacy Triage Settings (collapsed) ---
		const legacySection = containerEl.createEl('details');
		legacySection.createEl('summary', { text: 'Legacy Triage Settings (deprecated)', cls: 'settings-legacy-toggle' });

		legacySection.createEl('p', {
			text: 'These settings are from the AI triage feature which has been replaced by the Priority Dashboard. They are kept for backwards compatibility.',
			cls: 'setting-item-description'
		});

		let watchedFoldersTextArea: HTMLTextAreaElement;

		new Setting(legacySection)
			.setName('Watched folders')
			.setDesc('Comma-separated list of folders to monitor for new files')
			.addTextArea(text => {
				watchedFoldersTextArea = text.inputEl;
				text.setPlaceholder('Emails/, TeamsChats/, Calendar/')
					.setValue(this.plugin.settings.watchedFolders.join(', '))
					.onChange(async (value) => {
						this.plugin.settings.watchedFolders = value
							.split(',')
							.map(f => f.trim())
							.filter(f => f.length > 0);
						await this.plugin.saveSettings();
					});
			})
			.addButton(button => button
				.setButtonText('Add Folder')
				.setIcon('folder-plus')
				.onClick(() => {
					new FolderSuggestModal(
						this.app,
						(selected) => {
							const pathWithSlash = selected.path.endsWith('/')
								? selected.path
								: selected.path + '/';

							const normalizedPath = selected.path.replace(/\/+$/, '');
							const existingNormalized = this.plugin.settings.watchedFolders
								.map(f => f.replace(/\/+$/, ''));

							if (existingNormalized.includes(normalizedPath)) {
								new Notice(`"${selected.path}" is already in the watch list`);
								return;
							}

							this.plugin.settings.watchedFolders.push(pathWithSlash);
							void this.plugin.saveSettings();
							watchedFoldersTextArea.value = this.plugin.settings.watchedFolders.join(', ');
						},
						this.plugin.settings.watchedFolders
					).open();
				}));

		new Setting(legacySection)
			.setName('Enable auto-triage')
			.setDesc('Automatically triage new files in watched folders (deprecated)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoTriageEnabled)
				.onChange(async (value) => {
					this.plugin.settings.autoTriageEnabled = value;
					await this.plugin.saveSettings();
					if (value) {
						this.plugin.fileWatcher?.start();
					} else {
						this.plugin.fileWatcher?.stop();
					}
				}));

		new Setting(legacySection)
			.setName('Triage context file')
			.setDesc('Path to markdown file with triage context (deprecated)')
			.addText(text => text
				.setPlaceholder('triage-context.md')
				.setValue(this.plugin.settings.triageContextPath)
				.onChange(async (value) => {
					this.plugin.settings.triageContextPath = value;
					await this.plugin.saveSettings();
				}));
	}
}
