/**
 * TaskNote creation orchestrator
 * Dispatches to domain generators based on triage category
 */

import { Vault, TFile, TFolder, normalizePath } from 'obsidian';
import { AITriageSettings } from './settings';
import { TriageItem, TriageCategory, TriageSuggestion } from './triage-queue';
import { ClientCode, DeliverableType, formatDate } from './domain/deliverables';
import { generateDeliverableTaskNoteContent } from './domain/deliverables';
import { generateChangeOrderTaskNoteContent, CostType, AffectedSystem } from './domain/change-orders';
import { generateTestingMilestoneContent, TestPhase } from './domain/testing';
import { generateInteropIssueContent, InteropIssueType } from './domain/interoperability';
import { generateGenericTaskNoteContent, GenericTaskCategory } from './domain/generic-task';

export interface TaskNoteCreationResult {
	success: boolean;
	taskNotePath?: string;
	error?: string;
	wasDuplicate?: boolean;
	duplicatePath?: string;
}

export interface TaskNoteCreationParams {
	item: TriageItem;
	project?: string;
	overrides?: Partial<TriageSuggestion>;
}

/**
 * Project keyword mappings for inference
 */
const PROJECT_KEYWORDS: Record<string, string[]> = {
	'NIOP Interoperability': ['NIOP', 'interop', 'IAG', 'E-ZPass', 'reciprocity', 'hub'],
	'CSC RFP': ['CSC RFP', 'procurement', 'RFP', 'bid', 'proposal'],
	'CSC Operations Support': ['CSC', 'customer service', 'call center', 'operations'],
	'Roadside Systems': ['roadside', 'lane', 'tolling point', 'AVI', 'ALPR', 'gantry'],
	'BOS Implementation': ['BOS', 'back office', 'back-office', 'posting'],
	'MOMS': ['MOMS', 'maintenance', 'monitoring'],
	'DVAS': ['DVAS', 'violation', 'image review']
};

/**
 * Orchestrates TaskNote creation from triage items
 */
export class TaskNoteCreator {
	private vault: Vault;
	private settings: AITriageSettings;

	constructor(vault: Vault, settings: AITriageSettings) {
		this.vault = vault;
		this.settings = settings;
	}

	/**
	 * Main entry point - create TaskNote from a triage item
	 */
	async createFromTriageItem(params: TaskNoteCreationParams): Promise<TaskNoteCreationResult> {
		const { item, project, overrides } = params;

		try {
			// Merge user edits and overrides with suggestion
			const finalSuggestion: TriageSuggestion = {
				...item.suggestion,
				...item.userEdits,
				...overrides
			};

			// Generate content based on category
			const content = this.generateContent(item.filePath, finalSuggestion, project);

			// Generate filename
			const filename = this.generateFilename(finalSuggestion.title || item.fileName);

			// Ensure TaskNotes folder exists
			const taskNotesFolder = this.settings.taskNotesFolder || 'TaskNotes';
			await this.ensureFolder(taskNotesFolder);

			// Build full path
			let fullPath = normalizePath(`${taskNotesFolder}/${filename}.md`);

			// Handle filename collisions
			if (await this.vault.adapter.exists(fullPath)) {
				const timestamp = Date.now();
				fullPath = normalizePath(`${taskNotesFolder}/${filename}-${timestamp}.md`);
			}

			// Create the file
			await this.vault.create(fullPath, content);

			return {
				success: true,
				taskNotePath: fullPath
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error('Failed to create TaskNote:', error);
			return {
				success: false,
				error: errorMessage
			};
		}
	}

	/**
	 * Generate TaskNote content based on category
	 */
	private generateContent(
		sourceFilePath: string,
		suggestion: TriageSuggestion,
		project?: string
	): string {
		const sourceFile = sourceFilePath.split('/').pop()?.replace(/\.md$/, '') || sourceFilePath;
		const client = this.resolveClient(suggestion.client);
		const category = suggestion.category;

		switch (category) {
			case 'DELIVERABLE_REVIEW':
				return this.generateDeliverableContent(suggestion, sourceFile, client, project);

			case 'CHANGE_ORDER':
				return this.generateChangeOrderContent(suggestion, sourceFile, client, project);

			case 'TESTING_MILESTONE':
				return this.generateTestingContent(suggestion, sourceFile, client, project);

			case 'INTEROPERABILITY_ISSUE':
				return this.generateInteropContent(suggestion, sourceFile, client, project);

			default:
				return this.generateGenericContent(suggestion, sourceFile, client, project);
		}
	}

	/**
	 * Generate content for deliverable review
	 */
	private generateDeliverableContent(
		suggestion: TriageSuggestion,
		sourceFile: string,
		client: ClientCode,
		project?: string
	): string {
		const deliverable = suggestion.deliverable;
		const submissionDate = suggestion.dueDate
			? new Date(suggestion.dueDate)
			: new Date();

		// Determine deliverable type
		let deliverableType: DeliverableType = 'OTHER';
		if (deliverable?.type) {
			const typeUpper = deliverable.type.toUpperCase();
			if (typeUpper in { SDDD: 1, ICD: 1, TEST_PLAN: 1, OM_MANUAL: 1, CHANGE_ORDER: 1, TRAINING_MATERIAL: 1, AS_BUILT: 1, USER_GUIDE: 1, OTHER: 1 }) {
				deliverableType = typeUpper as DeliverableType;
			}
		}

		return generateDeliverableTaskNoteContent({
			title: suggestion.title,
			deliverableType,
			version: deliverable?.version,
			vendor: deliverable?.vendor,
			client,
			submissionDate,
			reviewDeadline: deliverable?.reviewDeadline ? new Date(deliverable.reviewDeadline) : undefined,
			project,
			sourceFile,
			reasoning: suggestion.reasoning
		});
	}

	/**
	 * Generate content for change order review
	 */
	private generateChangeOrderContent(
		suggestion: TriageSuggestion,
		sourceFile: string,
		client: ClientCode,
		project?: string
	): string {
		const co = suggestion.changeOrder || {};

		return generateChangeOrderTaskNoteContent({
			title: suggestion.title,
			coNumber: co.coNumber || 'TBD',
			vendor: suggestion.deliverable?.vendor || 'Unknown',
			client,
			submissionDate: suggestion.dueDate ? new Date(suggestion.dueDate) : new Date(),
			proposedAmount: co.proposedAmount || 0,
			costType: 'fixed_price' as CostType,
			description: suggestion.reasoning,
			affectedSystems: co.affectedSystems as AffectedSystem[] | undefined
		});
	}

	/**
	 * Generate content for testing milestone
	 */
	private generateTestingContent(
		suggestion: TriageSuggestion,
		sourceFile: string,
		client: ClientCode,
		project?: string
	): string {
		const testing = suggestion.testing || {};

		// Parse phase
		let phase: TestPhase = 'FAT';
		if (testing.phase) {
			const phaseUpper = testing.phase.toUpperCase();
			if (phaseUpper in { FAT: 1, IAT: 1, SAT: 1, OAT: 1, UAT: 1, REGRESSION: 1 }) {
				phase = phaseUpper as TestPhase;
			}
		}

		const scheduledStart = testing.scheduledStart
			? new Date(testing.scheduledStart)
			: new Date();
		const scheduledEnd = testing.scheduledEnd
			? new Date(testing.scheduledEnd)
			: new Date(scheduledStart.getTime() + 7 * 24 * 60 * 60 * 1000); // Default 1 week

		return generateTestingMilestoneContent({
			title: suggestion.title,
			phase,
			scheduledStart,
			scheduledEnd,
			vendor: suggestion.deliverable?.vendor,
			client
		});
	}

	/**
	 * Generate content for interoperability issue
	 */
	private generateInteropContent(
		suggestion: TriageSuggestion,
		sourceFile: string,
		client: ClientCode,
		project?: string
	): string {
		const interop = suggestion.interop || {};

		// Determine issue type from content
		let issueType: InteropIssueType = 'other';
		const titleLower = suggestion.title.toLowerCase();
		if (titleLower.includes('iag') && titleLower.includes('file')) {
			issueType = 'iag_file_error';
		} else if (titleLower.includes('reciprocity')) {
			issueType = 'reciprocity_failure';
		} else if (titleLower.includes('hub')) {
			issueType = 'hub_down';
		} else if (titleLower.includes('niop')) {
			issueType = 'niop_update';
		}

		return generateInteropIssueContent({
			title: suggestion.title,
			issueType,
			homeAgency: interop.homeAgency || client,
			awayAgency: interop.awayAgency || 'Unknown',
			description: suggestion.reasoning,
			client
		});
	}

	/**
	 * Generate content for generic categories
	 */
	private generateGenericContent(
		suggestion: TriageSuggestion,
		sourceFile: string,
		client: ClientCode | undefined,
		project?: string
	): string {
		// Map triage category to generic task category
		const genericCategories: TriageCategory[] = [
			'SYSTEM_ISSUE',
			'MEETING_FOLLOWUP',
			'VENDOR_CORRESPONDENCE',
			'CLIENT_CORRESPONDENCE',
			'INFORMATIONAL',
			'UNCLEAR'
		];

		const category: GenericTaskCategory = genericCategories.includes(suggestion.category)
			? suggestion.category as GenericTaskCategory
			: 'UNCLEAR';

		return generateGenericTaskNoteContent({
			title: suggestion.title,
			client,
			priority: suggestion.priority || 'medium',
			dueDate: suggestion.dueDate ? new Date(suggestion.dueDate) : undefined,
			category,
			reasoning: suggestion.reasoning,
			sourceFile,
			project,
			tags: suggestion.tags
		});
	}

	/**
	 * Generate kebab-case filename from title
	 */
	generateFilename(title: string): string {
		// Remove or replace invalid filename characters
		let filename = title
			.toLowerCase()
			.replace(/[\\/:*?"<>|]/g, '') // Remove invalid chars
			.replace(/\s+/g, '-')          // Spaces to hyphens
			.replace(/-+/g, '-')           // Collapse multiple hyphens
			.replace(/^-|-$/g, '')         // Trim leading/trailing hyphens
			.substring(0, 100);            // Limit length

		// Prefix with TaskNote-
		return `TaskNote-${filename}`;
	}

	/**
	 * Find potential duplicate TaskNotes
	 */
	async findDuplicates(item: TriageItem): Promise<TFile[]> {
		const duplicates: TFile[] = [];
		const taskNotesFolder = this.settings.taskNotesFolder || 'TaskNotes';

		// Get all TaskNote files
		const folder = this.vault.getAbstractFileByPath(taskNotesFolder);
		if (!folder || !(folder instanceof TFolder)) {
			return duplicates;
		}

		const taskNotes = folder.children.filter(
			(f): f is TFile => f instanceof TFile && f.extension === 'md'
		);

		// Check for source file reference
		const sourceFileName = item.filePath.split('/').pop()?.replace(/\.md$/, '');
		if (sourceFileName) {
			for (const file of taskNotes) {
				const content = await this.vault.cachedRead(file);
				if (content.includes(`[[${sourceFileName}]]`)) {
					duplicates.push(file);
				}
			}
		}

		// Check for similar title (>70% word overlap)
		const titleWords = new Set(
			item.suggestion.title.toLowerCase().split(/\s+/).filter(w => w.length > 2)
		);
		if (titleWords.size > 0) {
			for (const file of taskNotes) {
				// Skip if already marked as duplicate
				if (duplicates.includes(file)) continue;

				const fileTitle = file.basename.replace(/^TaskNote-/, '').replace(/-/g, ' ');
				const fileWords = new Set(
					fileTitle.toLowerCase().split(/\s+/).filter(w => w.length > 2)
				);

				// Calculate overlap
				let overlap = 0;
				for (const word of titleWords) {
					if (fileWords.has(word)) overlap++;
				}

				const overlapRatio = overlap / Math.max(titleWords.size, fileWords.size);
				if (overlapRatio > 0.7) {
					duplicates.push(file);
				}
			}
		}

		return duplicates;
	}

	/**
	 * Ensure a folder exists, creating it if needed
	 */
	private async ensureFolder(path: string): Promise<void> {
		const normalizedPath = normalizePath(path);
		const exists = await this.vault.adapter.exists(normalizedPath);

		if (!exists) {
			await this.vault.createFolder(normalizedPath);
		}
	}

	/**
	 * Resolve client code from suggestion or settings
	 */
	private resolveClient(suggestedClient?: string): ClientCode {
		const validClients: ClientCode[] = ['DRPA', 'VDOT', 'MDTA', 'DelDOT'];

		if (suggestedClient && validClients.includes(suggestedClient as ClientCode)) {
			return suggestedClient as ClientCode;
		}

		if (this.settings.defaultClient && validClients.includes(this.settings.defaultClient as ClientCode)) {
			return this.settings.defaultClient as ClientCode;
		}

		return 'DRPA'; // Fallback
	}
}

/**
 * Infer project from content keywords
 */
export function inferProject(content: string, client: string): string | null {
	let bestMatch: { project: string; score: number } | null = null;

	for (const [project, keywords] of Object.entries(PROJECT_KEYWORDS)) {
		for (const kw of keywords) {
			if (content.toLowerCase().includes(kw.toLowerCase())) {
				// Multi-word matches score higher (specificity weighting)
				const score = kw.split(' ').length;
				if (!bestMatch || score > bestMatch.score) {
					bestMatch = { project, score };
				}
			}
		}
	}

	return bestMatch?.project ?? null;
}

/**
 * Get list of projects for a client by scanning folder structure
 */
export async function getProjectsForClient(
	vault: Vault,
	client: string,
	projectsBasePath: string = '01-Projects'
): Promise<string[]> {
	const basePath = normalizePath(`${projectsBasePath}/${client}`);
	const folder = vault.getAbstractFileByPath(basePath);

	if (!folder || !(folder instanceof TFolder)) {
		return [];
	}

	return folder.children
		.filter((f): f is TFolder => f instanceof TFolder)
		.map(f => f.name)
		.sort();
}
