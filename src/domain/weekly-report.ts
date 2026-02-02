/**
 * Weekly PIP Report Domain Logic
 *
 * Pure TypeScript functions for generating weekly PIP reports.
 * No Obsidian dependencies - all vault operations are in weekly-report-generator.ts
 */

import {
	DashboardState,
	DashboardPipStatus,
	DashboardCompletedTask,
	StatedPriority
} from '../state-types';

// --- Types ---

/**
 * Habit metrics aggregated for weekly report
 */
export interface HabitMetrics {
	eodStatus: {
		completed: number;
		target: number;
		percentage: number;
		dailyStatus: { date: string; done: boolean; dayLabel: string }[];
	};
	morningCheck: {
		completed: number;
		target: number;
		percentage: number;
		dailyStatus: { date: string; done: boolean; dayLabel: string }[];
	};
	sameDayAck?: {
		completed: number;
		total: number;
		percentage: number;
		avgDelayMinutes: number | null;
	};
}

/**
 * A task completed during the report week
 */
export interface TaskAccomplishment {
	filename: string;
	task: string;
	completedDate: string;
	linkedPriority?: number; // Rank of matched stated priority (1, 2, 3, etc.)
	notes?: string;
}

/**
 * A stated priority with completion status
 */
export interface PriorityAlignmentItem {
	rank: number;
	task: string;
	tasknote: string;
	status: 'completed' | 'in_progress' | 'not_started';
	completedDate?: string;
}

/**
 * A milestone with progress tracking
 */
export interface MilestoneProgressItem {
	name: string;
	target: string;
	criteriaMet: number;
	criteriaTotal: number;
	percentage: number;
}

/**
 * Week boundaries in Eastern Time
 */
export interface WeekBoundaries {
	weekStart: Date;      // Monday at 00:00:00 ET
	weekEnd: Date;        // Sunday at 23:59:59 ET
	weekStartStr: string; // YYYY-MM-DD format
	weekEndStr: string;   // YYYY-MM-DD format
}

/**
 * Complete data for weekly report generation
 */
export interface WeeklyReportData {
	weekBoundaries: WeekBoundaries;
	pipDay: number;
	pipWeek: number;
	pipPhase: string;
	habits: HabitMetrics;
	accomplishments: TaskAccomplishment[];
	priorityAlignment: PriorityAlignmentItem[];
	milestones: MilestoneProgressItem[];
	generatedAt: string;
}

// --- Helper Functions ---

/**
 * Get day label (Mon, Tue, etc.) from date string
 */
function getDayLabel(dateStr: string): string {
	const date = new Date(dateStr + 'T12:00:00'); // Noon to avoid timezone issues
	return date.toLocaleDateString('en-US', { weekday: 'short' });
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
	const isoString = date.toISOString();
	const datePart = isoString.split('T')[0];
	return datePart ?? isoString.slice(0, 10);
}


// --- Core Functions ---

/**
 * Calculate the Monday-Sunday week boundaries for a given date in Eastern Time
 *
 * @param referenceDate The date to calculate week boundaries for (defaults to today)
 * @returns WeekBoundaries with Monday start and Sunday end
 */
export function calculateWeekBoundaries(referenceDate?: Date): WeekBoundaries {
	// Get current time in Eastern
	const now = referenceDate ?? new Date();
	const easternStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
	const eastern = new Date(easternStr);

	// Get the day of week (0 = Sunday, 1 = Monday, etc.)
	const dayOfWeek = eastern.getDay();

	// Calculate days since Monday (Sunday = 6 days back, Monday = 0 days back)
	const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

	// Calculate Monday of this week
	const monday = new Date(eastern);
	monday.setDate(eastern.getDate() - daysSinceMonday);
	monday.setHours(0, 0, 0, 0);

	// Calculate Sunday of this week
	const sunday = new Date(monday);
	sunday.setDate(monday.getDate() + 6);
	sunday.setHours(23, 59, 59, 999);

	return {
		weekStart: monday,
		weekEnd: sunday,
		weekStartStr: formatDate(monday),
		weekEndStr: formatDate(sunday)
	};
}

/**
 * Aggregate habit metrics from PIP status
 *
 * @param pip The dashboard PIP status
 * @returns Aggregated habit metrics for the week
 */
export function aggregateHabitMetrics(pip: DashboardPipStatus): HabitMetrics {
	// EOD Status
	const eodDailyStatus = pip.habits.eodStatus.thisWeek.map(day => ({
		date: day.date,
		done: day.done,
		dayLabel: getDayLabel(day.date)
	}));
	const eodCompleted = pip.habits.eodStatus.count;
	const eodTarget = pip.habits.eodStatus.target;

	// Morning Check
	const morningDailyStatus = pip.habits.morningCheck.thisWeek.map(day => ({
		date: day.date,
		done: day.done,
		dayLabel: getDayLabel(day.date)
	}));
	const morningCompleted = pip.habits.morningCheck.count;
	const morningTarget = pip.habits.morningCheck.target;

	// Same Day Ack (optional)
	let sameDayAck: HabitMetrics['sameDayAck'] = undefined;
	if (pip.sameDayAck && pip.sameDayAck.total > 0) {
		sameDayAck = {
			completed: pip.sameDayAck.completed,
			total: pip.sameDayAck.total,
			percentage: Math.round((pip.sameDayAck.completed / pip.sameDayAck.total) * 100),
			avgDelayMinutes: pip.sameDayAck.avgDelayMinutes
		};
	}

	return {
		eodStatus: {
			completed: eodCompleted,
			target: eodTarget,
			percentage: eodTarget > 0 ? Math.round((eodCompleted / eodTarget) * 100) : 0,
			dailyStatus: eodDailyStatus
		},
		morningCheck: {
			completed: morningCompleted,
			target: morningTarget,
			percentage: morningTarget > 0 ? Math.round((morningCompleted / morningTarget) * 100) : 0,
			dailyStatus: morningDailyStatus
		},
		sameDayAck
	};
}

/**
 * Map completed tasks to stated priorities
 *
 * @param completed Recently completed tasks
 * @param priorities Stated priorities from manager
 * @param weekBoundaries Week to filter completions
 * @returns Task accomplishments with priority linkage
 */
export function mapAccomplishmentsToPriorities(
	completed: DashboardCompletedTask[] | undefined,
	priorities: StatedPriority[],
	weekBoundaries: WeekBoundaries
): TaskAccomplishment[] {
	if (!completed || completed.length === 0) {
		return [];
	}

	// Filter to tasks completed within the week
	const weekStart = weekBoundaries.weekStartStr;
	const weekEnd = weekBoundaries.weekEndStr;

	const weeklyCompleted = completed.filter(task => {
		const completedDate = task.completedDate;
		return completedDate >= weekStart && completedDate <= weekEnd;
	});

	// Map each completion to check for priority alignment
	return weeklyCompleted.map(task => {
		// Look for a priority that matches this task's filename
		const matchedPriority = priorities.find(p =>
			p.tasknote === task.filename ||
			p.tasknote === task.filename.replace('.md', '') ||
			task.filename.includes(p.tasknote.replace('.md', ''))
		);

		return {
			filename: task.filename,
			task: task.task,
			completedDate: task.completedDate,
			linkedPriority: matchedPriority?.rank,
			notes: task.notes
		};
	});
}

/**
 * Calculate priority alignment status
 *
 * @param priorities Stated priorities
 * @param completed Recently completed tasks
 * @returns Priority alignment items with status
 */
export function calculatePriorityAlignment(
	priorities: StatedPriority[],
	completed: DashboardCompletedTask[] | undefined
): PriorityAlignmentItem[] {
	return priorities.map(priority => {
		// Check if this priority was completed
		const completedTask = completed?.find(task =>
			task.filename === priority.tasknote ||
			task.filename === priority.tasknote.replace('.md', '') ||
			priority.tasknote.includes(task.filename.replace('.md', ''))
		);

		if (completedTask) {
			return {
				rank: priority.rank,
				task: priority.task,
				tasknote: priority.tasknote,
				status: 'completed' as const,
				completedDate: completedTask.completedDate
			};
		}

		// Default to not_started (could be enhanced to check in_progress)
		return {
			rank: priority.rank,
			task: priority.task,
			tasknote: priority.tasknote,
			status: 'not_started' as const
		};
	});
}

/**
 * Calculate milestone progress
 *
 * @param pip PIP status with milestones
 * @returns Milestone progress items
 */
export function calculateMilestoneProgress(pip: DashboardPipStatus): MilestoneProgressItem[] {
	if (!pip.milestones) {
		return [];
	}

	return Object.entries(pip.milestones).map(([name, milestone]) => ({
		name,
		target: milestone.target,
		criteriaMet: milestone.criteriaMet,
		criteriaTotal: milestone.criteriaTotal,
		percentage: milestone.criteriaTotal > 0
			? Math.round((milestone.criteriaMet / milestone.criteriaTotal) * 100)
			: 0
	}));
}

/**
 * Generate the complete weekly report data
 *
 * @param state Dashboard state
 * @param referenceDate Optional reference date for week calculation
 * @returns Complete weekly report data or null if PIP not active
 */
export function generateWeeklyReportData(
	state: DashboardState,
	referenceDate?: Date
): WeeklyReportData | null {
	const pip = state.pipStatus;

	if (!pip || !pip.active) {
		return null;
	}

	const weekBoundaries = calculateWeekBoundaries(referenceDate);
	const habits = aggregateHabitMetrics(pip);
	const accomplishments = mapAccomplishmentsToPriorities(
		state.recentlyCompleted,
		state.statedPriorities,
		weekBoundaries
	);
	const priorityAlignment = calculatePriorityAlignment(
		state.statedPriorities,
		state.recentlyCompleted
	);
	const milestones = calculateMilestoneProgress(pip);

	return {
		weekBoundaries,
		pipDay: pip.dayNumber,
		pipWeek: pip.weekNumber,
		pipPhase: pip.currentPhase,
		habits,
		accomplishments,
		priorityAlignment,
		milestones,
		generatedAt: new Date().toISOString()
	};
}

/**
 * Generate markdown content for weekly report
 *
 * @param data Weekly report data
 * @returns Markdown string for the report
 */
export function generateWeeklyReportMarkdown(data: WeeklyReportData): string {
	const weekStartFormatted = new Date(data.weekBoundaries.weekStartStr + 'T12:00:00')
		.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

	const lines: string[] = [];

	// Frontmatter
	lines.push('---');
	lines.push(`title: "Weekly PIP Report - Week of ${data.weekBoundaries.weekStartStr}"`);
	lines.push('type: weekly-report');
	lines.push(`pip_week: ${data.pipWeek}`);
	lines.push(`pip_day: ${data.pipDay}`);
	lines.push(`created: ${data.weekBoundaries.weekStartStr}`);
	lines.push('---');
	lines.push('');

	// Header
	lines.push('# Weekly PIP Report');
	lines.push(`**Week of ${weekStartFormatted}**`);
	lines.push(`**PIP Day ${data.pipDay} of 90 | Week ${data.pipWeek} | ${data.pipPhase} Phase**`);
	lines.push('');

	// Habit Metrics Section
	lines.push('## Habit Metrics');
	lines.push('');

	// EOD Status
	const eod = data.habits.eodStatus;
	const eodDays = eod.dailyStatus.map(d => `${d.dayLabel}: ${d.done ? '\u2713' : '\u25CB'}`).join(' ');
	lines.push(`- **EOD Status:** ${eod.completed}/${eod.target} (${eod.percentage}%) - ${eodDays}`);

	// Morning Check
	const morning = data.habits.morningCheck;
	const morningDays = morning.dailyStatus.map(d => `${d.dayLabel}: ${d.done ? '\u2713' : '\u25CB'}`).join(' ');
	lines.push(`- **Morning Check:** ${morning.completed}/${morning.target} (${morning.percentage}%) - ${morningDays}`);

	// Same Day Ack (if available)
	if (data.habits.sameDayAck) {
		const sda = data.habits.sameDayAck;
		const avgDelay = sda.avgDelayMinutes !== null ? `, avg ${sda.avgDelayMinutes} min response` : '';
		lines.push(`- **Same-Day Ack:** ${sda.completed}/${sda.total} (${sda.percentage}%)${avgDelay}`);
	}
	lines.push('');

	// Task Accomplishments Section
	lines.push('## Task Accomplishments');
	lines.push('');

	if (data.accomplishments.length === 0) {
		lines.push('*No tasks completed this week*');
	} else {
		lines.push('| Task | Completed | Priority |');
		lines.push('|------|-----------|----------|');
		for (const task of data.accomplishments) {
			const priorityStr = task.linkedPriority ? `#${task.linkedPriority}` : '-';
			lines.push(`| [[${task.filename.replace('.md', '')}]] | ${task.completedDate} | ${priorityStr} |`);
		}
	}
	lines.push('');

	// Priority Alignment Section
	lines.push('## Priority Alignment');
	lines.push('');

	if (data.priorityAlignment.length === 0) {
		lines.push('*No stated priorities to track*');
	} else {
		lines.push('| # | Priority | Status |');
		lines.push('|---|----------|--------|');
		for (const priority of data.priorityAlignment) {
			const statusIcon = priority.status === 'completed' ? '\u2713 Completed'
				: priority.status === 'in_progress' ? '\u25D4 In Progress'
				: '\u25CB Not Started';
			lines.push(`| ${priority.rank} | ${priority.task} | ${statusIcon} |`);
		}
	}
	lines.push('');

	// Milestone Progress Section
	lines.push('## Milestone Progress');
	lines.push('');

	if (data.milestones.length === 0) {
		lines.push('*No milestones defined*');
	} else {
		lines.push('| Milestone | Progress |');
		lines.push('|-----------|----------|');
		for (const milestone of data.milestones) {
			lines.push(`| ${milestone.name} | ${milestone.criteriaMet}/${milestone.criteriaTotal} (${milestone.percentage}%) |`);
		}
	}
	lines.push('');

	// Footer
	lines.push('---');
	lines.push(`*Generated: ${new Date(data.generatedAt).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET*`);

	return lines.join('\n');
}

/**
 * Generate the filename for a weekly report
 *
 * @param weekStartDate Monday of the report week (YYYY-MM-DD format)
 * @returns Filename in format PIP-Report-Week-YYYY-MM-DD.md
 */
export function generateReportFilename(weekStartDate: string): string {
	return `PIP-Report-Week-${weekStartDate}.md`;
}
