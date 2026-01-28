import { ItemView, WorkspaceLeaf, MarkdownView, Notice } from 'obsidian';
import AITriagePlugin from '../main';

export const CHAT_SIDEBAR_VIEW_TYPE = 'ai-triage-chat-sidebar';

interface ChatMessage {
	role: 'user' | 'assistant';
	content: string;
	timestamp: number;
}

/**
 * Sidebar for chatting about the current note
 */
export class ChatSidebarView extends ItemView {
	plugin: AITriagePlugin;
	private messagesEl!: HTMLElement;
	private inputEl!: HTMLTextAreaElement;
	private messages: ChatMessage[] = [];
	private isLoading = false;

	constructor(leaf: WorkspaceLeaf, plugin: AITriagePlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return CHAT_SIDEBAR_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Note Chat';
	}

	getIcon(): string {
		return 'message-circle';
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('ai-triage-chat-sidebar');

		// Header
		const header = this.contentEl.createDiv({ cls: 'chat-header' });
		header.createEl('h4', { text: 'Chat about this note' });

		// Tabs
		const tabs = header.createDiv({ cls: 'chat-tabs' });
		const chatTab = tabs.createEl('button', { text: 'Chat', cls: 'chat-tab active' });
		const memoriesTab = tabs.createEl('button', { text: 'Memories', cls: 'chat-tab' });

		chatTab.addEventListener('click', () => this.showChatTab());
		memoriesTab.addEventListener('click', () => this.showMemoriesTab());

		// Messages container
		this.messagesEl = this.contentEl.createDiv({ cls: 'chat-messages' });

		// Input area
		const inputContainer = this.contentEl.createDiv({ cls: 'chat-input-container' });
		this.inputEl = inputContainer.createEl('textarea', {
			cls: 'chat-input',
			attr: { placeholder: 'Ask about this note...' }
		});

		const sendBtn = inputContainer.createEl('button', {
			text: 'Send',
			cls: 'chat-send-btn'
		});

		// Event handlers
		this.inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.sendMessage();
			}
		});

		sendBtn.addEventListener('click', () => this.sendMessage());

		// Initial render
		this.renderMessages();
	}

	async onClose(): Promise<void> {
		// Cleanup if needed
	}

	private showChatTab(): void {
		// TODO: Toggle tab visibility
	}

	private showMemoriesTab(): void {
		// TODO: Show SimpleMem search interface
	}

	private renderMessages(): void {
		this.messagesEl.empty();

		if (this.messages.length === 0) {
			const emptyEl = this.messagesEl.createDiv({ cls: 'chat-empty' });
			emptyEl.createEl('p', { text: 'Ask questions about the current note.' });
			emptyEl.createEl('p', {
				text: 'Try: "What are the key action items?" or "Summarize this email"',
				cls: 'chat-hint'
			});
			return;
		}

		for (const message of this.messages) {
			const messageEl = this.messagesEl.createDiv({
				cls: `chat-message chat-message-${message.role}`
			});
			messageEl.createEl('div', {
				text: message.content,
				cls: 'chat-message-content'
			});
		}

		// Scroll to bottom
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}

	private async sendMessage(): Promise<void> {
		const query = this.inputEl.value.trim();
		if (!query || this.isLoading) return;

		// Add user message
		this.messages.push({
			role: 'user',
			content: query,
			timestamp: Date.now()
		});
		this.inputEl.value = '';
		this.renderMessages();

		// Get current note context
		const context = await this.buildContext();
		if (!context) {
			this.messages.push({
				role: 'assistant',
				content: 'Please open a note to chat about it.',
				timestamp: Date.now()
			});
			this.renderMessages();
			return;
		}

		// Show loading state
		this.isLoading = true;
		const loadingEl = this.messagesEl.createDiv({ cls: 'chat-loading' });
		loadingEl.createEl('span', { text: 'Thinking...' });

		try {
			// Build prompt with context
			const prompt = this.buildPrompt(query, context);

			// Call Ollama
			const response = await this.plugin.ollama.generate(prompt);

			// Add assistant message
			this.messages.push({
				role: 'assistant',
				content: response,
				timestamp: Date.now()
			});
		} catch (error) {
			this.messages.push({
				role: 'assistant',
				content: `Error: ${error instanceof Error ? error.message : 'Failed to get response'}`,
				timestamp: Date.now()
			});
		} finally {
			this.isLoading = false;
			loadingEl.remove();
			this.renderMessages();
		}
	}

	private async buildContext(): Promise<string | null> {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) return null;

		const file = activeView.file;
		if (!file) return null;

		try {
			const content = await this.app.vault.read(file);
			return `# ${file.basename}\n\n${content}`;
		} catch {
			return null;
		}
	}

	private buildPrompt(query: string, context: string): string {
		return `You are a helpful assistant analyzing a note from an Obsidian vault.
The user is a tolling program manager who works on toll system projects for clients like DRPA, VDOT, MDTA, and DelDOT.

Here is the current note:
---
${context}
---

User question: ${query}

Provide a helpful, concise response. If the user asks to create a task, suggest the task details but note that you cannot create tasks directly - they should use the Triage Queue.`;
	}
}
