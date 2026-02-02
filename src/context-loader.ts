import { TFile, Vault, normalizePath } from 'obsidian';

const MAX_CONTEXT_SIZE = 10240; // 10KB

export interface ContextResult {
	content: string | null;
	warning?: string;
}

/**
 * Loads and caches the dynamic triage context file
 * Provides sanitization to prevent prompt injection attacks
 */
export class TriageContextLoader {
	private cache: { content: string; mtime: number } | null = null;

	constructor(private vault: Vault) {}

	/**
	 * Load the triage context file with caching and sanitization
	 * @param contextPath Path to the context markdown file
	 */
	async load(contextPath: string): Promise<ContextResult> {
		if (!contextPath?.trim()) {
			return { content: null };
		}

		const file = this.vault.getAbstractFileByPath(normalizePath(contextPath));
		if (!file || !(file instanceof TFile)) {
			return { content: null, warning: `Context file not found: ${contextPath}` };
		}

		// Check cache by modification time
		if (this.cache && file.stat.mtime === this.cache.mtime) {
			return { content: this.cache.content };
		}

		try {
			let content = await this.vault.read(file);

			// Size guard - truncate if too large
			if (content.length > MAX_CONTEXT_SIZE) {
				content = content.substring(0, MAX_CONTEXT_SIZE);
				const sanitized = this.sanitizeContext(content);
				// Update cache even for truncated content
				this.cache = { content: sanitized, mtime: file.stat.mtime };
				return {
					content: sanitized,
					warning: 'Context file truncated (>10KB)'
				};
			}

			const sanitized = this.sanitizeContext(content);
			this.cache = { content: sanitized, mtime: file.stat.mtime };
			return { content: sanitized };
		} catch (error) {
			console.error('Failed to load triage context:', error);
			return { content: null, warning: `Failed to load context: ${error}` };
		}
	}

	/**
	 * Sanitize context content to prevent prompt injection
	 * - Escapes angle brackets to prevent XML-style tag injection
	 * - Escapes square brackets to prevent markdown link injection
	 * - Escapes code fences to prevent prompt boundary confusion
	 */
	private sanitizeContext(content: string): string {
		return content
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/\[/g, '&#91;')
			.replace(/\]/g, '&#93;')
			.replace(/```/g, '\\`\\`\\`'); // Escape code fences
	}

	/**
	 * Clear the cache (useful for testing or forced refresh)
	 */
	clearCache(): void {
		this.cache = null;
	}
}
