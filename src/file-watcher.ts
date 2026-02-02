import { TFile, Notice } from 'obsidian';
import AITriagePlugin from './main';
import { OllamaClient } from './ollama-client';
import { TriageQueue, TriageSuggestion, TriageCategory } from './triage-queue';
import { AITriageSettings } from './settings';
import { buildTriagePrompt, parseTriageResponse } from './prompts/tolling-triage-prompt';
import { TriageContextLoader } from './context-loader';

interface QueuedFile {
	file: TFile;
	addedAt: number;
}

interface TeamsConversationBuffer {
	files: TFile[];
	lastUpdate: number;
	conversationId: string;
}

/**
 * Result of a manual folder scan
 */
export interface ScanResult {
	filesToTriage: TFile[];
	skippedAlreadyQueued: number;
	skippedSensitive: number;
	skippedTooOld: number;
}

/**
 * Rate-limited file watcher with debouncing and concurrency control
 */
export class RateLimitedWatcher {
	private plugin: AITriagePlugin;
	private ollama: OllamaClient;
	private triageQueue: TriageQueue;
	private settings: AITriageSettings;
	private contextLoader: TriageContextLoader;

	private fileQueue: QueuedFile[] = [];
	private processing = false;
	private activeTriages = 0;

	private teamsBuffer: Map<string, TeamsConversationBuffer> = new Map();
	private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

	private isWatching = false;
	private isScanning = false;
	private scanAborted = false;

	constructor(plugin: AITriagePlugin, ollama: OllamaClient, triageQueue: TriageQueue) {
		this.plugin = plugin;
		this.ollama = ollama;
		this.triageQueue = triageQueue;
		this.settings = plugin.settings;
		this.contextLoader = new TriageContextLoader(plugin.app.vault);
	}

	updateSettings(settings: AITriageSettings): void {
		this.settings = settings;
	}

	/**
	 * Start watching for new files
	 */
	start(): void {
		if (this.isWatching) return;

		this.isWatching = true;

		// Watch for file creation
		this.plugin.registerEvent(
			this.plugin.app.vault.on('create', (file) => {
				if (file instanceof TFile) {
					this.handleFileChange(file);
				}
			})
		);

		// Watch for file modification (for files that are created then written)
		this.plugin.registerEvent(
			this.plugin.app.vault.on('modify', (file) => {
				if (file instanceof TFile) {
					this.handleFileChange(file);
				}
			})
		);

		console.log('AI Triage: File watcher started');
	}

	/**
	 * Stop watching for files
	 */
	stop(): void {
		this.isWatching = false;

		// Clear all debounce timers
		for (const timer of this.debounceTimers.values()) {
			clearTimeout(timer);
		}
		this.debounceTimers.clear();

		console.log('AI Triage: File watcher stopped');
	}

	/**
	 * Check if a manual scan is currently in progress
	 */
	isScanInProgress(): boolean {
		return this.isScanning;
	}

	/**
	 * Preview what files would be scanned (does not queue anything)
	 * Useful for showing a count before committing to the scan
	 */
	async previewScan(): Promise<ScanResult> {
		const result: ScanResult = {
			filesToTriage: [],
			skippedAlreadyQueued: 0,
			skippedSensitive: 0,
			skippedTooOld: 0
		};

		// Calculate cutoff time based on lookback days
		const lookbackDays = this.settings.scanLookbackDays;
		const lookbackMs = lookbackDays > 0
			? lookbackDays * 24 * 60 * 60 * 1000
			: Infinity;
		const cutoffTime = Date.now() - lookbackMs;

		// Get all markdown files from vault
		const allFiles = this.plugin.app.vault.getMarkdownFiles();

		for (const file of allFiles) {
			// Check if in watched folder
			if (!this.isWatchedFile(file)) continue;

			// Check modification time
			if (file.stat.mtime < cutoffTime) {
				result.skippedTooOld++;
				continue;
			}

			// Check if already in queue
			if (this.triageQueue.hasFilePath(file.path)) {
				result.skippedAlreadyQueued++;
				continue;
			}

			// Check for sensitive content
			if (await this.isSensitiveFile(file)) {
				result.skippedSensitive++;
				continue;
			}

			result.filesToTriage.push(file);
		}

		return result;
	}

	/**
	 * Execute a manual scan of watched folders and queue discovered files
	 * @returns Number of files queued for triage
	 */
	async executeScan(): Promise<number> {
		if (this.isScanning) {
			throw new Error('Scan already in progress');
		}

		this.isScanning = true;
		this.scanAborted = false;

		try {
			const preview = await this.previewScan();

			// Queue each file for triage
			for (const file of preview.filesToTriage) {
				if (this.scanAborted) {
					console.log('AI Triage: Scan aborted by user');
					break;
				}

				// Add to internal file queue
				this.fileQueue.push({ file, addedAt: Date.now() });
			}

			// Trigger processing of queued files
			this.processQueue();

			return preview.filesToTriage.length;
		} finally {
			this.isScanning = false;
			this.scanAborted = false;
		}
	}

	/**
	 * Cancel an in-progress scan
	 */
	cancelScan(): void {
		if (this.isScanning) {
			this.scanAborted = true;
		}
	}

	/**
	 * Handle a file change event with debouncing
	 */
	private handleFileChange(file: TFile): void {
		if (!this.isWatching) return;
		if (!this.isWatchedFile(file)) return;

		// Clear existing debounce timer for this file
		const existingTimer = this.debounceTimers.get(file.path);
		if (existingTimer) {
			clearTimeout(existingTimer);
		}

		// Set new debounce timer
		const timer = setTimeout(() => {
			this.debounceTimers.delete(file.path);
			this.enqueueFile(file);
		}, this.settings.debounceDelayMs);

		this.debounceTimers.set(file.path, timer);
	}

	/**
	 * Check if a file is in a watched folder
	 */
	private isWatchedFile(file: TFile): boolean {
		return this.settings.watchedFolders.some(folder =>
			file.path.startsWith(folder)
		);
	}

	/**
	 * Check if file is a Teams message
	 */
	private isTeamsMessage(file: TFile): boolean {
		return file.path.startsWith('TeamsChats/');
	}

	/**
	 * Extract conversation ID from Teams message path
	 * Format: TeamsChats/19_conversationId@thread.v2-timestamp.md
	 */
	private extractConversationId(path: string): string {
		const fileName = path.split('/').pop() || path;
		// Extract the conversation ID portion before the timestamp
		const match = fileName.match(/^(19_[^-]+)/);
		return match?.[1] ?? fileName;
	}

	/**
	 * Enqueue a file for triage
	 */
	private async enqueueFile(file: TFile): Promise<void> {
		// Skip if already in triage queue
		if (this.triageQueue.hasFilePath(file.path)) {
			return;
		}

		// Check for sensitive content
		if (await this.isSensitiveFile(file)) {
			console.log(`AI Triage: Skipping sensitive file: ${file.path}`);
			return;
		}

		// Handle Teams messages with batching
		if (this.isTeamsMessage(file)) {
			await this.bufferTeamsMessage(file);
			return;
		}

		// Add to queue for immediate processing
		this.fileQueue.push({ file, addedAt: Date.now() });
		this.processQueue();
	}

	/**
	 * Check if a file contains sensitive content
	 */
	private async isSensitiveFile(file: TFile): Promise<boolean> {
		try {
			const content = await this.plugin.app.vault.read(file);

			// Check for sensitive tags in content
			for (const pattern of this.settings.sensitivePatterns) {
				if (content.includes(pattern)) {
					return true;
				}
			}

			// Check frontmatter tags
			const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
			if (frontmatterMatch?.[1]) {
				const frontmatter = frontmatterMatch[1];
				for (const tag of this.settings.skipTaggedFiles) {
					if (frontmatter.includes('tags:') && frontmatter.includes(tag)) {
						return true;
					}
				}
			}

			return false;
		} catch {
			return false;
		}
	}

	/**
	 * Buffer Teams messages for conversation-level triage
	 */
	private async bufferTeamsMessage(file: TFile): Promise<void> {
		const conversationId = this.extractConversationId(file.path);

		// Auto-index to SimpleMem if enabled
		if (this.settings.autoIndexTeamsToSimpleMem) {
			await this.indexToSimpleMem(file);
		}

		// Add to conversation buffer
		let buffer = this.teamsBuffer.get(conversationId);
		if (!buffer) {
			buffer = {
				files: [],
				lastUpdate: Date.now(),
				conversationId
			};
			this.teamsBuffer.set(conversationId, buffer);
		}

		buffer.files.push(file);
		buffer.lastUpdate = Date.now();

		// Schedule batch triage after quiet period
		const delayMs = this.settings.teamsBatchDelayMinutes * 60 * 1000;
		setTimeout(() => this.checkTeamsBatch(conversationId), delayMs);
	}

	/**
	 * Check if Teams conversation is ready for batch triage
	 */
	private async checkTeamsBatch(conversationId: string): Promise<void> {
		const buffer = this.teamsBuffer.get(conversationId);
		if (!buffer) return;

		const delayMs = this.settings.teamsBatchDelayMinutes * 60 * 1000;
		const quietPeriodPassed = Date.now() - buffer.lastUpdate >= delayMs;

		if (quietPeriodPassed) {
			await this.triageTeamsConversation(buffer.files, conversationId);
			this.teamsBuffer.delete(conversationId);
		}
	}

	/**
	 * Triage a batched Teams conversation
	 */
	private async triageTeamsConversation(files: TFile[], conversationId: string): Promise<void> {
		if (files.length === 0) return;

		try {
			// Combine all messages
			const messages: string[] = [];
			for (const file of files) {
				const content = await this.plugin.app.vault.read(file);
				messages.push(content);
			}
			const combinedContent = messages.join('\n---\n');

			// Triage the conversation
			const suggestion = await this.triageContent(
				combinedContent,
				`Teams conversation (${files.length} messages)`,
				'teams-conversation'
			);

			if (suggestion && suggestion.category !== 'INFORMATIONAL') {
				// Use first file path as representative
				const firstFile = files[0];
				if (firstFile) {
					await this.triageQueue.addItem(firstFile.path, {
						...suggestion,
						reasoning: `Conversation with ${files.length} messages: ${suggestion.reasoning || ''}`
					});
				}

				if (this.settings.showToastNotifications) {
					new Notice(`Teams conversation triaged: ${suggestion.category}`);
				}
			}
		} catch (error) {
			console.error('Failed to triage Teams conversation:', error);
		}
	}

	/**
	 * Index a Teams message to SimpleMem (placeholder - MCP integration)
	 */
	private async indexToSimpleMem(file: TFile): Promise<void> {
		// TODO: Integrate with SimpleMem MCP server
		// For now, just log that we would index
		console.log(`AI Triage: Would index to SimpleMem: ${file.path}`);
	}

	/**
	 * Process the file queue with concurrency control
	 */
	private async processQueue(): Promise<void> {
		if (this.processing) return;
		this.processing = true;

		try {
			while (this.fileQueue.length > 0 && this.activeTriages < this.settings.maxConcurrentTriages) {
				const item = this.fileQueue.shift();
				if (!item) break;

				this.activeTriages++;
				this.triageFile(item.file).finally(() => {
					this.activeTriages--;
				});
			}
		} finally {
			this.processing = false;

			// Continue processing if more items
			if (this.fileQueue.length > 0) {
				setTimeout(() => this.processQueue(), 100);
			}
		}
	}

	/**
	 * Triage a single file
	 */
	private async triageFile(file: TFile): Promise<void> {
		try {
			const content = await this.plugin.app.vault.read(file);
			const suggestion = await this.triageContent(content, file.basename, file.path);

			if (suggestion && suggestion.category !== 'INFORMATIONAL') {
				await this.triageQueue.addItem(file.path, suggestion);

				if (this.settings.showToastNotifications) {
					new Notice(`Triaged: ${file.basename} → ${suggestion.category}`);
				}
			}
		} catch (error) {
			console.error(`Failed to triage file ${file.path}:`, error);

			// Add to queue with UNCLEAR status on error
			await this.triageQueue.addItem(file.path, {
				category: 'UNCLEAR',
				title: file.basename,
				confidence: 0,
				reasoning: `Triage failed: ${error instanceof Error ? error.message : 'Unknown error'}`
			});
		}
	}

	/**
	 * Triage content using Ollama
	 */
	private async triageContent(
		content: string,
		subject: string,
		sourcePath: string
	): Promise<TriageSuggestion | null> {
		try {
			// Load dynamic context (cached, sanitized)
			const contextResult = await this.contextLoader.load(this.settings.triageContextPath);
			if (contextResult.warning) {
				console.warn('AI Triage context warning:', contextResult.warning);
			}

			// Build the triage prompt with optional dynamic context
			const prompt = buildTriagePrompt(
				content,
				subject,
				this.settings.defaultClient,
				contextResult.content || undefined
			);

			// Call Ollama
			const response = await this.ollama.generate(prompt);

			// Parse the response
			const suggestion = parseTriageResponse(response);

			return suggestion;
		} catch (error) {
			console.error('Triage content failed:', error);
			return null;
		}
	}
}
