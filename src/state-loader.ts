/**
 * State Loader - Parses Claude-State-Tracking.md into typed dashboard state
 *
 * Key features:
 * - Extracts JSON from markdown code blocks
 * - Validates with Zod schemas
 * - Caches by content hash for performance
 * - Handles partial state gracefully
 * - Returns clear error messages
 */

import { Vault, TFile } from 'obsidian';
import {
	StateDataSchema,
	StateData,
	ParsedStateResult,
	DashboardState,
	DashboardTask,
	DashboardPipStatus,
	DashboardCompletedTask,
	ActiveTaskNote,
	PipTracking,
	RecentlyCompleted
} from './state-types';

/**
 * Simple hash function for cache invalidation
 */
function simpleHash(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash; // Convert to 32bit integer
	}
	return hash.toString(16);
}

/**
 * Extract JSON content from markdown code blocks
 * Handles ```json ... ``` format
 */
function extractJsonBlocks(content: string): string[] {
	const blocks: string[] = [];
	const regex = /```json\s*([\s\S]*?)```/g;
	let match;

	while ((match = regex.exec(content)) !== null) {
		const jsonContent = match[1]?.trim();
		if (jsonContent) {
			blocks.push(jsonContent);
		}
	}

	return blocks;
}

/**
 * Try to parse JSON with helpful error messages
 */
function safeJsonParse(jsonString: string, blockIndex: number): { data: unknown; error?: string } {
	try {
		const data = JSON.parse(jsonString);
		return { data };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		// Try to extract line number from error
		const lineMatch = errorMessage.match(/position (\d+)/);
		let context = '';
		if (lineMatch && lineMatch[1]) {
			const position = parseInt(lineMatch[1], 10);
			const start = Math.max(0, position - 50);
			const end = Math.min(jsonString.length, position + 50);
			context = `\n  Near: "${jsonString.slice(start, end)}"`;
		}
		return {
			data: null,
			error: `JSON block ${blockIndex + 1}: ${errorMessage}${context}`
		};
	}
}

/**
 * Calculate days until a date (negative if overdue)
 */
function daysUntil(dateStr: string): number {
	const target = new Date(dateStr);
	const now = new Date();
	// Reset time components to compare dates only
	target.setHours(0, 0, 0, 0);
	now.setHours(0, 0, 0, 0);
	const diffMs = target.getTime() - now.getTime();
	return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Convert priority string to normalized priority level
 */
function normalizePriority(priority: string): 'critical' | 'high' | 'medium' | 'low' {
	const lower = priority.toLowerCase();
	if (lower === 'critical') return 'critical';
	if (lower === 'high') return 'high';
	if (lower === 'medium') return 'medium';
	return 'low';
}

/**
 * Convert ActiveTaskNote to DashboardTask
 */
function toDashboardTask(task: ActiveTaskNote): DashboardTask {
	return {
		filename: task.filename,
		title: task.task,
		status: task.status,
		dueDate: task.due,
		daysOverdue: task.days_overdue,
		client: task.client,
		project: task.project,
		priority: normalizePriority(task.priority),
		waitingOn: task.waitingOn,
		notes: task.notes
	};
}

/**
 * Convert RecentlyCompleted to DashboardCompletedTask
 */
function toDashboardCompletedTask(task: RecentlyCompleted): DashboardCompletedTask {
	return {
		filename: task.filename,
		task: task.task,
		completedDate: task.completedDate,
		notes: task.notes
	};
}

/**
 * Convert PipTracking to DashboardPipStatus
 */
function toDashboardPipStatus(pip: PipTracking): DashboardPipStatus {
	const totalDays = 90;
	const percentComplete = Math.round((pip.days_complete / totalDays) * 100);

	// Calculate days until next check-in
	let daysUntilCheckin: number | null = null;
	if (pip.next_checkin_date) {
		daysUntilCheckin = daysUntil(pip.next_checkin_date);
	}

	// Convert habit data
	const eodWeek = pip.habits.eod_status.this_week.map(d => ({
		date: d.date,
		done: d.sent ?? false
	}));

	const morningWeek = pip.habits.morning_check.this_week.map(d => ({
		date: d.date,
		done: d.done ?? false
	}));

	// Convert same_day_ack if present
	const sameDayAck = pip.habits.same_day_ack ? {
		completed: pip.habits.same_day_ack.this_week_completed,
		total: pip.habits.same_day_ack.this_week_total,
		avgDelayMinutes: pip.habits.same_day_ack.avg_delay_minutes
	} : undefined;

	// Convert milestones if present
	const milestones = pip.milestones ? Object.fromEntries(
		Object.entries(pip.milestones).map(([key, value]) => [
			key,
			{
				target: value.target,
				criteriaMet: value.criteria_met,
				criteriaTotal: value.criteria_total
			}
		])
	) : undefined;

	return {
		active: pip.active,
		dayNumber: pip.days_complete,
		totalDays,
		percentComplete,
		currentPhase: pip.current_phase,
		weekNumber: pip.week_number,
		nextCheckinDate: pip.next_checkin_date,
		daysUntilCheckin,
		feedbackDue: pip.pip_feedback_due,
		habits: {
			eodStatus: {
				thisWeek: eodWeek,
				count: pip.habits.eod_status.count,
				target: pip.habits.eod_status.target
			},
			morningCheck: {
				thisWeek: morningWeek,
				count: pip.habits.morning_check.count,
				target: pip.habits.morning_check.target
			}
		},
		sameDayAck,
		milestones
	};
}

/**
 * State Loader class with caching
 */
export class StateLoader {
	private vault: Vault;
	private cachedHash: string | null = null;
	private cachedState: DashboardState | null = null;

	constructor(vault: Vault) {
		this.vault = vault;
	}

	/**
	 * Load and parse the state file
	 * @param filePath Path to Claude-State-Tracking.md
	 * @returns Parsed dashboard state
	 */
	async loadState(filePath: string): Promise<DashboardState> {
		try {
			// Get the file
			const file = this.vault.getAbstractFileByPath(filePath);
			if (!file) {
				return this.createErrorState(`State file not found: ${filePath}`);
			}

			if (!(file instanceof TFile)) {
				return this.createErrorState(`Path is not a file: ${filePath}`);
			}

			// Read content
			const content = await this.vault.read(file);

			// Check cache
			const contentHash = simpleHash(content);
			if (this.cachedHash === contentHash && this.cachedState) {
				return this.cachedState;
			}

			// Parse the state
			const result = this.parseStateContent(content);

			if (!result.success || !result.data) {
				return this.createErrorState(result.error ?? 'Unknown parse error', result.warnings);
			}

			// Transform to dashboard state
			const dashboardState = this.transformToDashboardState(result.data, result.warnings);

			// Cache the result
			this.cachedHash = contentHash;
			this.cachedState = dashboardState;

			return dashboardState;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return this.createErrorState(`Failed to load state: ${errorMessage}`);
		}
	}

	/**
	 * Invalidate the cache (call when you know the file has changed)
	 */
	invalidateCache(): void {
		this.cachedHash = null;
		this.cachedState = null;
	}

	/**
	 * Parse the markdown content and extract state data
	 */
	private parseStateContent(content: string): ParsedStateResult {
		const warnings: string[] = [];

		// Extract JSON blocks
		const jsonBlocks = extractJsonBlocks(content);

		if (jsonBlocks.length === 0) {
			return {
				success: false,
				data: null,
				error: 'No JSON code blocks found in state file'
			};
		}

		// Parse each JSON block
		const parsedBlocks: unknown[] = [];
		for (let i = 0; i < jsonBlocks.length; i++) {
			const jsonBlock = jsonBlocks[i];
			if (!jsonBlock) continue;
			const result = safeJsonParse(jsonBlock, i);
			if (result.error) {
				warnings.push(result.error);
				continue;
			}
			parsedBlocks.push(result.data);
		}

		if (parsedBlocks.length === 0) {
			return {
				success: false,
				data: null,
				error: 'All JSON blocks failed to parse',
				warnings
			};
		}

		// Try to find and validate the main state block
		// The main state has comprehensive_tracking
		let mainState: unknown = null;
		for (const block of parsedBlocks) {
			if (block && typeof block === 'object' && 'comprehensive_tracking' in block) {
				mainState = block;
				break;
			}
		}

		if (!mainState) {
			// Try the first block if no comprehensive_tracking found
			mainState = parsedBlocks[0];
			warnings.push('No block with comprehensive_tracking found, using first JSON block');
		}

		// Validate with Zod
		const validation = StateDataSchema.safeParse(mainState);

		if (!validation.success) {
			// Extract useful error info from Zod
			const zodErrors = validation.error.issues.map(issue => {
				return `${issue.path.join('.')}: ${issue.message}`;
			}).join('; ');

			return {
				success: false,
				data: null,
				error: `State validation failed: ${zodErrors}`,
				warnings
			};
		}

		return {
			success: true,
			data: validation.data,
			warnings: warnings.length > 0 ? warnings : undefined
		};
	}

	/**
	 * Transform validated StateData into DashboardState
	 */
	private transformToDashboardState(data: StateData, warnings?: string[]): DashboardState {
		const tracking = data.comprehensive_tracking;
		const pip = data.pip_tracking;

		// Get all active tasks
		const allTasks = tracking.active_tasknotes || [];
		const dashboardTasks = allTasks.map(toDashboardTask);

		// Sort tasks into categories
		const overdueTasks = dashboardTasks
			.filter(t => t.daysOverdue > 0)
			.sort((a, b) => b.daysOverdue - a.daysOverdue);

		const dueThisWeek = dashboardTasks
			.filter(t => {
				if (!t.dueDate) return false;
				const days = daysUntil(t.dueDate);
				return days >= 0 && days <= 7 && t.daysOverdue <= 0;
			})
			.sort((a, b) => {
				if (!a.dueDate || !b.dueDate) return 0;
				return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
			});

		const dueNextWeek = dashboardTasks
			.filter(t => {
				if (!t.dueDate) return false;
				const days = daysUntil(t.dueDate);
				return days > 7 && days <= 14;
			})
			.sort((a, b) => {
				if (!a.dueDate || !b.dueDate) return 0;
				return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
			});

		// Extract stated priorities
		const statedPriorities = tracking.stated_priorities?.priorities || [];

		// Transform recently completed tasks
		const recentlyCompleted = tracking.recently_completed
			? tracking.recently_completed.map(toDashboardCompletedTask)
			: undefined;

		// Transform PIP status
		const pipStatus = pip ? toDashboardPipStatus(pip) : null;

		// Summary stats
		const summaryStats = {
			totalTasks: tracking.direct_tasks ?? allTasks.length,
			overdueCount: tracking.overdue_direct_tasks ?? overdueTasks.length,
			dueToday: tracking.due_today ?? 0,
			dueThisWeek: tracking.due_this_week ?? dueThisWeek.length,
			completedTotal: tracking.completed_tasks ?? 0
		};

		return {
			lastUpdated: tracking.dashboard_generated || tracking.last_scan_timestamp || null,
			overdueTasks,
			dueThisWeek,
			dueNextWeek,
			statedPriorities,
			pipStatus,
			recentlyCompleted,
			summaryStats,
			warnings
		};
	}

	/**
	 * Create an error state for display
	 */
	private createErrorState(error: string, warnings?: string[]): DashboardState {
		return {
			lastUpdated: null,
			overdueTasks: [],
			dueThisWeek: [],
			dueNextWeek: [],
			statedPriorities: [],
			pipStatus: null,
			summaryStats: {
				totalTasks: 0,
				overdueCount: 0,
				dueToday: 0,
				dueThisWeek: 0,
				completedTotal: 0
			},
			error,
			warnings
		};
	}
}

/**
 * Check if current time is after 2pm Eastern
 * Used for EOD status reminders
 */
export function isAfter2pmEastern(): boolean {
	const now = new Date();
	const easternTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
	return easternTime.getHours() >= 14;
}

/**
 * Check if EOD status was sent today
 */
export function wasEodSentToday(pipStatus: DashboardPipStatus | null): boolean {
	if (!pipStatus) return true; // Don't show reminder if no PIP tracking

	const today = new Date().toISOString().split('T')[0];
	const todayEntry = pipStatus.habits.eodStatus.thisWeek.find(d => d.date === today);
	return todayEntry?.done ?? false;
}

/**
 * Format days overdue for display
 */
export function formatDaysOverdue(days: number): string {
	if (days === 0) return 'Due today';
	if (days === 1) return '1 day overdue';
	return `${days} days overdue`;
}

/**
 * Format days until due for display
 */
export function formatDaysUntil(days: number): string {
	if (days === 0) return 'Today';
	if (days === 1) return 'Tomorrow';
	return `${days} days`;
}
