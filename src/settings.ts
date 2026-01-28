import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import AITriagePlugin from './main';

export interface AITriageSettings {
	// Ollama Configuration
	ollamaBaseUrl: string;
	triageModel: string;
	embeddingModel: string;
	requestTimeout: number;

	// Watched Folders
	watchedFolders: string[];

	// Sensitive Content
	sensitivePatterns: string[];
	skipTaggedFiles: string[];

	// Client/Vendor Configuration
	defaultClient: string;
	vendorEmailDomains: Record<string, string>;

	// Triage Behavior
	autoTriageEnabled: boolean;
	teamsBatchDelayMinutes: number;
	maxConcurrentTriages: number;
	debounceDelayMs: number;

	// SimpleMem Integration
	autoIndexTeamsToSimpleMem: boolean;

	// UI Preferences
	showToastNotifications: boolean;
}

export const DEFAULT_SETTINGS: AITriageSettings = {
	// Ollama - hardcoded to localhost only for security
	ollamaBaseUrl: 'http://127.0.0.1:11434',
	triageModel: 'gemma3:latest',
	embeddingModel: 'qwen3-embedding:8b',
	requestTimeout: 30000,

	// Default watched folders
	watchedFolders: [
		'Emails/',
		'TeamsChats/',
		'Calendar/'
	],

	// Sensitive content patterns (files with these tags are skipped)
	sensitivePatterns: ['#confidential', '#sensitive', '#private'],
	skipTaggedFiles: ['confidential', 'sensitive', 'private'],

	// Client configuration
	defaultClient: 'DRPA',
	vendorEmailDomains: {
		'transcore.com': 'TransCore',
		'conduent.com': 'Conduent',
		'kapsch.net': 'Kapsch',
		'neology.net': 'Neology'
	},

	// Triage behavior
	autoTriageEnabled: true,
	teamsBatchDelayMinutes: 5,
	maxConcurrentTriages: 2,
	debounceDelayMs: 1000,

	// SimpleMem
	autoIndexTeamsToSimpleMem: true,

	// UI
	showToastNotifications: true
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

		containerEl.createEl('h1', { text: 'AI Triage Settings' });

		// --- Ollama Configuration ---
		containerEl.createEl('h2', { text: 'Ollama Configuration' });

		new Setting(containerEl)
			.setName('Ollama URL')
			.setDesc('Local Ollama server URL (security: only 127.0.0.1 allowed)')
			.addText(text => text
				.setPlaceholder('http://127.0.0.1:11434')
				.setValue(this.plugin.settings.ollamaBaseUrl)
				.setDisabled(true) // Hardcoded for security
			);

		new Setting(containerEl)
			.setName('Triage Model')
			.setDesc('Model for classification and chat (e.g., gemma3:latest)')
			.addText(text => text
				.setPlaceholder('gemma3:latest')
				.setValue(this.plugin.settings.triageModel)
				.onChange(async (value) => {
					this.plugin.settings.triageModel = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Embedding Model')
			.setDesc('Model for semantic search (e.g., qwen3-embedding:8b)')
			.addText(text => text
				.setPlaceholder('qwen3-embedding:8b')
				.setValue(this.plugin.settings.embeddingModel)
				.onChange(async (value) => {
					this.plugin.settings.embeddingModel = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Request Timeout')
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

		new Setting(containerEl)
			.setName('Test Connection')
			.setDesc('Verify Ollama is running and accessible')
			.addButton(button => button
				.setButtonText('Test')
				.onClick(async () => {
					button.setDisabled(true);
					button.setButtonText('Testing...');
					const result = await this.plugin.ollama.testConnection();
					if (result.success) {
						new Notice(`✓ Connected to Ollama (${result.model})`);
					} else {
						new Notice(`✗ Connection failed: ${result.error}`);
					}
					button.setButtonText('Test');
					button.setDisabled(false);
				}));

		// --- Watched Folders ---
		containerEl.createEl('h2', { text: 'Watched Folders' });

		new Setting(containerEl)
			.setName('Folders to Watch')
			.setDesc('Comma-separated list of folders to monitor for new files')
			.addTextArea(text => text
				.setPlaceholder('Emails/, TeamsChats/, Calendar/')
				.setValue(this.plugin.settings.watchedFolders.join(', '))
				.onChange(async (value) => {
					this.plugin.settings.watchedFolders = value
						.split(',')
						.map(f => f.trim())
						.filter(f => f.length > 0);
					await this.plugin.saveSettings();
				}));

		// --- Sensitive Content ---
		containerEl.createEl('h2', { text: 'Sensitive Content' });

		new Setting(containerEl)
			.setName('Skip Tags')
			.setDesc('Files with these tags will be skipped (comma-separated)')
			.addText(text => text
				.setPlaceholder('#confidential, #sensitive')
				.setValue(this.plugin.settings.sensitivePatterns.join(', '))
				.onChange(async (value) => {
					this.plugin.settings.sensitivePatterns = value
						.split(',')
						.map(t => t.trim())
						.filter(t => t.length > 0);
					await this.plugin.saveSettings();
				}));

		// --- Client/Vendor Configuration ---
		containerEl.createEl('h2', { text: 'Client & Vendor Configuration' });

		new Setting(containerEl)
			.setName('Default Client')
			.setDesc('Default client for new tasks when not detected')
			.addDropdown(dropdown => dropdown
				.addOptions({
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

		// --- Triage Behavior ---
		containerEl.createEl('h2', { text: 'Triage Behavior' });

		new Setting(containerEl)
			.setName('Enable Auto-Triage')
			.setDesc('Automatically triage new files in watched folders')
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

		new Setting(containerEl)
			.setName('Teams Batch Delay')
			.setDesc('Minutes to wait for Teams conversation to settle before triage')
			.addText(text => text
				.setPlaceholder('5')
				.setValue(String(this.plugin.settings.teamsBatchDelayMinutes))
				.onChange(async (value) => {
					const num = parseInt(value, 10);
					if (!isNaN(num) && num > 0) {
						this.plugin.settings.teamsBatchDelayMinutes = num;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Max Concurrent Triages')
			.setDesc('Maximum number of files to triage simultaneously')
			.addText(text => text
				.setPlaceholder('2')
				.setValue(String(this.plugin.settings.maxConcurrentTriages))
				.onChange(async (value) => {
					const num = parseInt(value, 10);
					if (!isNaN(num) && num > 0 && num <= 5) {
						this.plugin.settings.maxConcurrentTriages = num;
						await this.plugin.saveSettings();
					}
				}));

		// --- SimpleMem Integration ---
		containerEl.createEl('h2', { text: 'SimpleMem Integration' });

		new Setting(containerEl)
			.setName('Auto-Index Teams Messages')
			.setDesc('Automatically index Teams messages to SimpleMem for semantic search')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoIndexTeamsToSimpleMem)
				.onChange(async (value) => {
					this.plugin.settings.autoIndexTeamsToSimpleMem = value;
					await this.plugin.saveSettings();
				}));

		// --- UI Preferences ---
		containerEl.createEl('h2', { text: 'UI Preferences' });

		new Setting(containerEl)
			.setName('Show Toast Notifications')
			.setDesc('Show notifications when items are triaged')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showToastNotifications)
				.onChange(async (value) => {
					this.plugin.settings.showToastNotifications = value;
					await this.plugin.saveSettings();
				}));
	}
}
