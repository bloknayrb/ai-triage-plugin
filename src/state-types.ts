/**
 * Zod schemas and TypeScript types for Claude State Tracking data
 *
 * These types match the structure in Claude-State-Tracking.md
 */

import { z } from 'zod';

// --- Active TaskNote Schema ---
export const ActiveTaskNoteSchema = z.object({
	filename: z.string(),
	task: z.string(),
	status: z.string(),
	due: z.string().nullable(),
	days_overdue: z.number(),
	client: z.string(),
	project: z.string(),
	priority: z.string(),
	source: z.string().optional(),
	notes: z.string().optional(),
	waitingOn: z.string().optional()
});

export type ActiveTaskNote = z.infer<typeof ActiveTaskNoteSchema>;

// --- Recently Completed Task Schema ---
export const RecentlyCompletedSchema = z.object({
	filename: z.string(),
	task: z.string(),
	completedDate: z.string(),
	notes: z.string().optional()
});

export type RecentlyCompleted = z.infer<typeof RecentlyCompletedSchema>;

// --- Stated Priority Schema ---
export const StatedPrioritySchema = z.object({
	rank: z.number(),
	task: z.string(),
	tasknote: z.string(),
	deadline: z.string().nullable(),
	context: z.string(),
	stated_by: z.string()
});

export type StatedPriority = z.infer<typeof StatedPrioritySchema>;

// --- Stated Priorities Section Schema ---
export const StatedPrioritiesSchema = z.object({
	last_priority_discussion: z.string().optional(),
	source_meeting: z.string().optional(),
	priorities: z.array(StatedPrioritySchema),
	blocked_items_acknowledged: z.array(z.string()).optional(),
	priority_valid_until: z.string().optional(),
	notes: z.string().optional()
});

export type StatedPriorities = z.infer<typeof StatedPrioritiesSchema>;

// --- Current Priorities (free-form strings) ---
export const CurrentPrioritiesSchema = z.object({
	immediate_focus: z.string().optional(),
	critically_overdue: z.string().optional(),
	niop_project_tasks: z.string().optional(),
	pip_status: z.string().optional(),
	bryan_actions_next: z.string().optional()
}).passthrough(); // Allow additional keys

export type CurrentPriorities = z.infer<typeof CurrentPrioritiesSchema>;

// --- Habit Day Entry ---
export const HabitDaySchema = z.object({
	date: z.string(),
	sent: z.boolean().optional(),
	done: z.boolean().optional()
});

export type HabitDay = z.infer<typeof HabitDaySchema>;

// --- EOD Status Tracking ---
export const EodStatusSchema = z.object({
	this_week: z.array(HabitDaySchema),
	count: z.number(),
	target: z.number()
});

export type EodStatus = z.infer<typeof EodStatusSchema>;

// --- Morning Check Tracking ---
export const MorningCheckSchema = z.object({
	this_week: z.array(HabitDaySchema),
	count: z.number(),
	target: z.number()
});

export type MorningCheck = z.infer<typeof MorningCheckSchema>;

// --- Same Day Acknowledgment Tracking ---
export const SameDayAckSchema = z.object({
	this_week_completed: z.number(),
	this_week_total: z.number(),
	avg_delay_minutes: z.number().nullable()
});

export type SameDayAck = z.infer<typeof SameDayAckSchema>;

// --- Habits Section ---
export const HabitsSchema = z.object({
	eod_status: EodStatusSchema,
	morning_check: MorningCheckSchema,
	same_day_ack: SameDayAckSchema.optional()
});

export type Habits = z.infer<typeof HabitsSchema>;

// --- Milestone Schema ---
export const MilestoneSchema = z.object({
	target: z.string(),
	criteria_met: z.number(),
	criteria_total: z.number()
});

export type Milestone = z.infer<typeof MilestoneSchema>;

// --- Check-in Entry ---
export const CheckinEntrySchema = z.object({
	num: z.number(),
	date: z.string(),
	phase: z.string(),
	done: z.boolean()
});

export type CheckinEntry = z.infer<typeof CheckinEntrySchema>;

// --- PIP Tracking Schema ---
export const PipTrackingSchema = z.object({
	active: z.boolean(),
	start_date: z.string(),
	end_date: z.string(),
	days_complete: z.number(),
	current_phase: z.string(),
	week_number: z.number(),
	next_checkin_date: z.string().nullable(),
	last_checkin_date: z.string().nullable(),
	pip_feedback_due: z.string().nullable(),
	performance_areas: z.array(z.string()),
	habits: HabitsSchema,
	task_pip_mapping: z.record(z.unknown()).optional(),
	area_task_counts: z.record(z.unknown()).optional(),
	estimation_log: z.array(z.unknown()).optional(),
	milestones: z.record(MilestoneSchema).optional(),
	checkin_schedule: z.array(CheckinEntrySchema).optional()
});

export type PipTracking = z.infer<typeof PipTrackingSchema>;

// --- Source Summary Schema ---
export const SourceSummarySchema = z.object({
	tasknotes_scanned: z.number().optional(),
	active_direct_tasks: z.number().optional(),
	tasks_overdue: z.number().optional(),
	tasks_due_today: z.number().optional(),
	tasks_due_this_week: z.number().optional(),
	tasks_due_next_week: z.number().optional(),
	tasks_waiting_review: z.number().optional(),
	tasks_completed_total: z.number().optional(),
	scan_date: z.string().optional(),
	scan_notes: z.string().optional()
}).passthrough();

export type SourceSummary = z.infer<typeof SourceSummarySchema>;

// --- Comprehensive Tracking Schema ---
export const ComprehensiveTrackingSchema = z.object({
	last_scan_timestamp: z.string().optional(),
	direct_tasks: z.number().optional(),
	managed_dependencies: z.number().optional(),
	background_awareness_items: z.number().optional(),
	total_tracked_items: z.number().optional(),
	overdue_direct_tasks: z.number().optional(),
	due_today: z.number().optional(),
	due_this_week: z.number().optional(),
	due_next_week: z.number().optional(),
	critical_risk_items: z.number().optional(),
	on_track_items: z.number().optional(),
	completed_tasks: z.number().optional(),
	active_tasknotes: z.array(ActiveTaskNoteSchema),
	recently_completed: z.array(RecentlyCompletedSchema).optional(),
	current_priorities: CurrentPrioritiesSchema.optional(),
	stated_priorities: StatedPrioritiesSchema.optional(),
	source_summary: SourceSummarySchema.optional(),
	dashboard_generated: z.string().optional()
}).passthrough();

export type ComprehensiveTracking = z.infer<typeof ComprehensiveTrackingSchema>;

// --- Full State Data Schema ---
export const StateDataSchema = z.object({
	system_architecture: z.record(z.unknown()).optional(),
	comprehensive_tracking: ComprehensiveTrackingSchema,
	tracking_cache: z.record(z.unknown()).optional(),
	command_integration: z.record(z.unknown()).optional(),
	pip_tracking: PipTrackingSchema.optional()
});

export type StateData = z.infer<typeof StateDataSchema>;

// --- Parsed State Result ---
export interface ParsedStateResult {
	success: boolean;
	data: StateData | null;
	error?: string;
	warnings?: string[];
}

// --- Dashboard Display Types ---

/**
 * Task formatted for dashboard display
 */
export interface DashboardTask {
	filename: string;
	title: string;
	status: string;
	dueDate: string | null;
	daysOverdue: number;
	client: string;
	project: string;
	priority: 'critical' | 'high' | 'medium' | 'low';
	waitingOn?: string;
	notes?: string;
}

/**
 * PIP status for dashboard display
 */
export interface DashboardPipStatus {
	active: boolean;
	dayNumber: number;
	totalDays: number;
	percentComplete: number;
	currentPhase: string;
	weekNumber: number;
	nextCheckinDate: string | null;
	daysUntilCheckin: number | null;
	feedbackDue: string | null;
	habits: {
		eodStatus: {
			thisWeek: { date: string; done: boolean }[];
			count: number;
			target: number;
		};
		morningCheck: {
			thisWeek: { date: string; done: boolean }[];
			count: number;
			target: number;
		};
	};
	sameDayAck?: {
		completed: number;
		total: number;
		avgDelayMinutes: number | null;
	};
	milestones?: Record<string, { target: string; criteriaMet: number; criteriaTotal: number }>;
}

/**
 * Completed task for weekly report
 */
export interface DashboardCompletedTask {
	filename: string;
	task: string;
	completedDate: string;
	notes?: string;
}

/**
 * Full dashboard state for rendering
 */
export interface DashboardState {
	lastUpdated: string | null;
	overdueTasks: DashboardTask[];
	dueThisWeek: DashboardTask[];
	dueNextWeek: DashboardTask[];
	statedPriorities: StatedPriority[];
	pipStatus: DashboardPipStatus | null;
	recentlyCompleted?: DashboardCompletedTask[];
	summaryStats: {
		totalTasks: number;
		overdueCount: number;
		dueToday: number;
		dueThisWeek: number;
		completedTotal: number;
	};
	error?: string;
	warnings?: string[];
}
