/**
 * Weekly Report Generator - Obsidian Integration
 *
 * Handles file system operations for creating weekly PIP reports.
 * Uses pure domain logic from domain/weekly-report.ts for data processing.
 */

import { Vault, TFolder } from 'obsidian';
import { DashboardState } from './state-types';
import {
	generateWeeklyReportData,
	generateWeeklyReportMarkdown,
	generateReportFilename,
	calculateWeekBoundaries
} from './domain/weekly-report';

/**
 * Result of a report generation attempt
 */
export interface ReportGenerationResult {
	success: boolean;
	filePath?: string;
	error?: string;
	alreadyExists?: boolean;
	pipNotActive?: boolean;
}

/**
 * Generator for weekly PIP reports with Obsidian vault integration
 */
export class WeeklyReportGenerator {
	private vault: Vault;
	private reportsFolder: string;

	constructor(vault: Vault, reportsFolder: string) {
		this.vault = vault;
		this.reportsFolder = reportsFolder;
	}

	/**
	 * Update the reports folder path (when settings change)
	 */
	updateReportsFolder(folder: string): void {
		this.reportsFolder = folder;
	}

	/**
	 * Generate a weekly report from dashboard state
	 *
	 * @param state Dashboard state containing PIP and task data
	 * @param referenceDate Optional reference date (defaults to today)
	 * @returns Result indicating success, file path, or error
	 */
	async generateReport(
		state: DashboardState,
		referenceDate?: Date
	): Promise<ReportGenerationResult> {
		try {
			// Check if PIP is active
			if (!state.pipStatus?.active) {
				return {
					success: false,
					pipNotActive: true,
					error: 'PIP tracking is not active'
				};
			}

			// Generate report data
			const reportData = generateWeeklyReportData(state, referenceDate);
			if (!reportData) {
				return {
					success: false,
					error: 'Failed to generate report data'
				};
			}

			// Generate filename and check if already exists
			const filename = generateReportFilename(reportData.weekBoundaries.weekStartStr);
			const filePath = `${this.reportsFolder}/${filename}`;

			if (await this.reportExists(filePath)) {
				return {
					success: false,
					alreadyExists: true,
					filePath,
					error: `Report already exists: ${filename}`
				};
			}

			// Ensure folder exists
			await this.ensureReportsFolder();

			// Generate markdown content
			const content = generateWeeklyReportMarkdown(reportData);

			// Create the file
			await this.vault.create(filePath, content);

			return {
				success: true,
				filePath
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				success: false,
				error: `Failed to generate report: ${message}`
			};
		}
	}

	/**
	 * Check if a report already exists for a given week
	 *
	 * @param referenceDate Date to check week for
	 * @returns True if report exists
	 */
	async reportExistsForWeek(referenceDate?: Date): Promise<boolean> {
		const weekBoundaries = calculateWeekBoundaries(referenceDate);
		const filename = generateReportFilename(weekBoundaries.weekStartStr);
		const filePath = `${this.reportsFolder}/${filename}`;
		return this.reportExists(filePath);
	}

	/**
	 * Check if a report file exists at the given path
	 */
	private async reportExists(filePath: string): Promise<boolean> {
		const file = this.vault.getAbstractFileByPath(filePath);
		return file !== null;
	}

	/**
	 * Ensure the reports folder exists, creating it if necessary
	 */
	async ensureReportsFolder(): Promise<void> {
		const folder = this.vault.getAbstractFileByPath(this.reportsFolder);

		if (!folder) {
			// Create folder (and any parent folders)
			await this.vault.createFolder(this.reportsFolder);
		} else if (!(folder instanceof TFolder)) {
			throw new Error(`${this.reportsFolder} exists but is not a folder`);
		}
	}

	/**
	 * Get the file path for the current week's report
	 */
	getCurrentWeekReportPath(referenceDate?: Date): string {
		const weekBoundaries = calculateWeekBoundaries(referenceDate);
		const filename = generateReportFilename(weekBoundaries.weekStartStr);
		return `${this.reportsFolder}/${filename}`;
	}
}

/**
 * Check if it's time to generate the weekly report
 *
 * @param generationDay Day of week for generation (sunday or monday)
 * @param generationHour Hour of day for generation (0-23)
 * @returns True if current time matches generation schedule
 */
export function isReportGenerationTime(
	generationDay: 'sunday' | 'monday',
	generationHour: number
): boolean {
	// Get current time in Eastern
	const now = new Date();
	const easternStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
	const eastern = new Date(easternStr);

	const dayOfWeek = eastern.getDay(); // 0 = Sunday, 1 = Monday
	const hour = eastern.getHours();

	const targetDay = generationDay === 'sunday' ? 0 : 1;

	return dayOfWeek === targetDay && hour === generationHour;
}
