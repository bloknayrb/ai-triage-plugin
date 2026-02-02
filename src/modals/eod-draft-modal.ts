/**
 * Modal for editing and copying EOD status drafts
 */

import { App, Modal, Notice } from 'obsidian';
import { EODStatusDraft, formatEODStatusMessage } from '../domain/eod-status';

/**
 * Modal for displaying and editing an EOD status draft
 */
export class EODDraftModal extends Modal {
	private draft: EODStatusDraft;
	private onMarkSent: () => void;
	private textArea: HTMLTextAreaElement | null = null;

	constructor(
		app: App,
		draft: EODStatusDraft,
		onMarkSent: () => void
	) {
		super(app);
		this.draft = draft;
		this.onMarkSent = onMarkSent;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('eod-draft-modal');

		// Header
		contentEl.createEl('h2', { text: 'EOD Status Draft' });

		// Date subtitle
		contentEl.createEl('p', {
			text: this.draft.dateFormatted,
			cls: 'eod-draft-date'
		});

		// Generate the formatted message
		const formattedMessage = formatEODStatusMessage(this.draft);

		// Editable textarea
		this.textArea = contentEl.createEl('textarea', {
			cls: 'eod-draft-textarea'
		});
		this.textArea.value = formattedMessage;
		this.textArea.rows = 15;

		// Instructions
		contentEl.createEl('p', {
			text: 'Edit the draft as needed, then copy to clipboard or mark as sent.',
			cls: 'eod-draft-instructions'
		});

		// Button container
		const buttonContainer = contentEl.createDiv({ cls: 'eod-draft-buttons' });

		// Copy to Clipboard button
		const copyBtn = buttonContainer.createEl('button', {
			text: 'Copy to Clipboard',
			cls: 'eod-draft-btn eod-copy-btn'
		});
		copyBtn.addEventListener('click', () => this.copyToClipboard());

		// Mark Sent button
		const markSentBtn = buttonContainer.createEl('button', {
			text: 'Mark Sent',
			cls: 'eod-draft-btn eod-mark-sent-btn mod-cta'
		});
		markSentBtn.addEventListener('click', () => this.markAsSent());

		// Close button
		const closeBtn = buttonContainer.createEl('button', {
			text: 'Close',
			cls: 'eod-draft-btn eod-close-btn'
		});
		closeBtn.addEventListener('click', () => this.close());
	}

	/**
	 * Copy the current textarea content to clipboard
	 */
	private async copyToClipboard(): Promise<void> {
		if (!this.textArea) return;

		try {
			await navigator.clipboard.writeText(this.textArea.value);
			new Notice('EOD status copied to clipboard');
		} catch (error) {
			// Fallback for older browsers
			this.textArea.select();
			document.execCommand('copy');
			new Notice('EOD status copied to clipboard');
		}
	}

	/**
	 * Mark the EOD status as sent and close the modal
	 */
	private markAsSent(): void {
		this.onMarkSent();
		new Notice('EOD status marked as sent');
		this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
