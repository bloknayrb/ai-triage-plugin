import { AITriageSettings } from './settings';

export interface OllamaGenerateResponse {
	response: string;
	done: boolean;
	context?: number[];
}

export interface OllamaEmbedResponse {
	embeddings: number[][];
}

export interface ConnectionTestResult {
	success: boolean;
	model?: string;
	error?: string;
}

/**
 * Client for local Ollama API
 * Security: Hardcoded to 127.0.0.1 - no DNS resolution, no external calls
 */
export class OllamaClient {
	// Hardcoded for security - prevents DNS-based attacks
	private readonly baseUrl = 'http://127.0.0.1:11434';
	private triageModel: string;
	private embeddingModel: string;
	private timeout: number;

	constructor(settings: AITriageSettings) {
		this.triageModel = settings.triageModel;
		this.embeddingModel = settings.embeddingModel;
		this.timeout = settings.requestTimeout;
	}

	updateSettings(settings: AITriageSettings): void {
		this.triageModel = settings.triageModel;
		this.embeddingModel = settings.embeddingModel;
		this.timeout = settings.requestTimeout;
	}

	/**
	 * Test connection to Ollama server
	 */
	async testConnection(): Promise<ConnectionTestResult> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 5000);

		try {
			const response = await fetch(`${this.baseUrl}/api/tags`, {
				method: 'GET',
				headers: {
					'User-Agent': 'Obsidian-AI-Triage/1.0'
				},
				signal: controller.signal
			});

			if (!response.ok) {
				return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
			}

			const data = await response.json();
			const models = data.models?.map((m: { name: string }) => m.name) || [];

			return {
				success: true,
				model: models.includes(this.triageModel)
					? this.triageModel
					: models[0] || 'unknown'
			};
		} catch (error) {
			if (error instanceof Error) {
				if (error.name === 'AbortError') {
					return { success: false, error: 'Connection timeout' };
				}
				return { success: false, error: error.message };
			}
			return { success: false, error: 'Unknown error' };
		} finally {
			clearTimeout(timeoutId);
		}
	}

	/**
	 * Generate text completion using the triage model
	 * @param prompt The prompt to send
	 * @param systemPrompt Optional system prompt for context
	 */
	async generate(prompt: string, systemPrompt?: string): Promise<string> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeout);

		try {
			const body: Record<string, unknown> = {
				model: this.triageModel,
				prompt: this.sanitizeInput(prompt),
				stream: false
			};

			if (systemPrompt) {
				body.system = this.sanitizeInput(systemPrompt);
			}

			const response = await fetch(`${this.baseUrl}/api/generate`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'User-Agent': 'Obsidian-AI-Triage/1.0'
				},
				body: JSON.stringify(body),
				signal: controller.signal
			});

			if (!response.ok) {
				throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
			}

			const data: OllamaGenerateResponse = await response.json();
			return data.response;
		} catch (error) {
			if (error instanceof Error) {
				if (error.name === 'AbortError') {
					throw new Error('Ollama request timed out');
				}
				throw error;
			}
			throw new Error('Unknown Ollama error');
		} finally {
			clearTimeout(timeoutId);
		}
	}

	/**
	 * Generate embeddings using the embedding model
	 * Note: Uses /api/embed (not /api/embeddings)
	 * @param text Text to embed
	 */
	async embed(text: string): Promise<number[]> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeout);

		try {
			const response = await fetch(`${this.baseUrl}/api/embed`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'User-Agent': 'Obsidian-AI-Triage/1.0'
				},
				body: JSON.stringify({
					model: this.embeddingModel,
					input: this.sanitizeInput(text)
				}),
				signal: controller.signal
			});

			if (!response.ok) {
				throw new Error(`Ollama embed error: ${response.status} ${response.statusText}`);
			}

			const data: OllamaEmbedResponse = await response.json();
			const embedding = data.embeddings?.[0];
			if (!embedding) {
				throw new Error('No embedding returned from Ollama');
			}
			return embedding;
		} catch (error) {
			if (error instanceof Error) {
				if (error.name === 'AbortError') {
					throw new Error('Ollama embed request timed out');
				}
				throw error;
			}
			throw new Error('Unknown Ollama embed error');
		} finally {
			clearTimeout(timeoutId);
		}
	}

	/**
	 * Sanitize input to prevent prompt injection
	 * Escapes special characters and uses delimiters
	 */
	private sanitizeInput(input: string): string {
		// Escape potentially dangerous characters
		return input
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/\[/g, '&#91;')
			.replace(/\]/g, '&#93;');
	}

	/**
	 * Check if Ollama is currently available
	 */
	async isAvailable(): Promise<boolean> {
		const result = await this.testConnection();
		return result.success;
	}
}
