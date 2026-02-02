/**
 * EOD Status Draft Generation
 *
 * Pure domain logic for generating EOD status draft messages.
 * Used by the Priority Dashboard to help users send timely status updates.
 */

import {
	DashboardState,
	DashboardTask
} from '../state-types';
import { isToday, getTodayEastern } from '../state-loader';

// --- Types ---

/**
 * Data structure for an EOD status draft
 */
export interface EODStatusDraft {
	date: string;                 // YYYY-MM-DD format
	dateFormatted: string;        // "Monday, February 2" for display
	completed: string[];          // Tasks completed today
	inProgress: InProgressItem[]; // Tasks currently being worked on
	flags: string[];              // Items needing attention (overdue >3 days)
}

export interface InProgressItem {
	task: string;
	percentComplete: string;
	client: string;
}

// --- Helper Functions ---

/**
 * Format a date string as "Day, Month Date" (e.g., "Monday, February 2")
 */
function formatDateForDisplay(dateStr: string): string {
	const date = new Date(dateStr + 'T12:00:00'); // Noon to avoid timezone issues
	return date.toLocaleDateString('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric'
	});
}

/**
 * Extract percent complete from status string or notes
 * Looks for patterns like "50%", "75% complete", etc.
 */
function extractPercentComplete(task: DashboardTask): string {
	// Check notes for percentage
	if (task.notes) {
		const match = task.notes.match(/(\d+)\s*%/);
		if (match && match[1]) {
			return `${match[1]}%`;
		}
	}

	// Default based on status
	const statusLower = task.status.toLowerCase();
	if (statusLower.includes('started') || statusLower === 'open') {
		return '10%';
	}
	if (statusLower.includes('progress') || statusLower === 'in_progress') {
		return '50%';
	}
	if (statusLower.includes('review') || statusLower.includes('waiting')) {
		return '80%';
	}

	return '50%'; // Default
}

/**
 * Check if a task should be flagged (overdue by more than 3 days)
 */
function shouldFlag(task: DashboardTask): boolean {
	return task.daysOverdue > 3;
}

// --- Core Functions ---

/**
 * Generate an EOD status draft from the dashboard state
 *
 * @param state Dashboard state containing tasks and completed items
 * @returns EOD status draft ready for editing
 */
export function generateEODStatusDraft(state: DashboardState): EODStatusDraft {
	const today = getTodayEastern();

	// Get tasks completed today
	const completedToday: string[] = [];
	if (state.recentlyCompleted) {
		for (const task of state.recentlyCompleted) {
			if (isToday(task.completedDate)) {
				completedToday.push(task.task);
			}
		}
	}

	// Get in-progress tasks (all non-completed active tasks)
	const inProgress: InProgressItem[] = [];
	const allActiveTasks = [
		...state.overdueTasks,
		...state.dueThisWeek,
		...state.dueNextWeek
	];

	// Deduplicate by filename
	const seen = new Set<string>();
	for (const task of allActiveTasks) {
		if (!seen.has(task.filename)) {
			seen.add(task.filename);

			// Skip waiting tasks for in-progress list
			if (task.status.toLowerCase().includes('waiting')) {
				continue;
			}

			inProgress.push({
				task: task.title,
				percentComplete: extractPercentComplete(task),
				client: task.client
			});
		}
	}

	// Get flagged items (significantly overdue)
	const flags: string[] = [];
	for (const task of state.overdueTasks) {
		if (shouldFlag(task)) {
			flags.push(`${task.title} (${task.daysOverdue} days overdue - ${task.client})`);
		}
	}

	return {
		date: today,
		dateFormatted: formatDateForDisplay(today),
		completed: completedToday,
		inProgress,
		flags
	};
}

/**
 * Format an EOD status draft as a text message
 *
 * @param draft EOD status draft data
 * @returns Formatted message ready to copy/send
 */
export function formatEODStatusMessage(draft: EODStatusDraft): string {
	const lines: string[] = [];

	lines.push(`EOD Status - ${draft.dateFormatted}`);
	lines.push('');

	// Completed section
	lines.push('**Completed Today:**');
	if (draft.completed.length === 0) {
		lines.push('- (None today)');
	} else {
		for (const item of draft.completed) {
			lines.push(`- ${item}`);
		}
	}
	lines.push('');

	// In Progress section
	lines.push('**In Progress:**');
	if (draft.inProgress.length === 0) {
		lines.push('- (No active tasks)');
	} else {
		for (const item of draft.inProgress) {
			lines.push(`- ${item.task} (${item.percentComplete}) - ${item.client}`);
		}
	}
	lines.push('');

	// Flags section (only if there are flagged items)
	if (draft.flags.length > 0) {
		lines.push('**Flags:**');
		for (const flag of draft.flags) {
			lines.push(`- ${flag}`);
		}
		lines.push('');
	}

	return lines.join('\n');
}
