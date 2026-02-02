/**
 * Mini-Report Detection and Template Generation
 *
 * Identifies completed tasks that warrant a "mini-report" to Jeremy
 * based on keyword detection. Excludes routine/administrative tasks.
 */

import { DashboardCompletedTask, MiniReportCandidate } from '../state-types';

// --- Keyword Configuration ---

/**
 * Keywords that indicate a task warrants a mini-report
 * Maps to the reason type for categorization
 */
const INCLUSION_KEYWORDS: Record<string, MiniReportCandidate['reason']> = {
	// Document review
	'review': 'document_review',
	'reviewed': 'document_review',
	'reviewing': 'document_review',
	'approve': 'document_review',
	'approved': 'document_review',
	'comment': 'document_review',
	'comments': 'document_review',
	'feedback': 'document_review',

	// Analysis complete
	'analysis': 'analysis_complete',
	'analyze': 'analysis_complete',
	'analyzed': 'analysis_complete',
	'estimate': 'analysis_complete',
	'estimated': 'analysis_complete',
	'assessment': 'analysis_complete',
	'evaluated': 'analysis_complete',
	'evaluation': 'analysis_complete',
	'comparison': 'analysis_complete',
	'reconcil': 'analysis_complete',  // reconcile, reconciliation

	// Deliverable sent
	'draft': 'deliverable_sent',
	'drafted': 'deliverable_sent',
	'send': 'deliverable_sent',
	'sent': 'deliverable_sent',
	'deliver': 'deliverable_sent',
	'delivered': 'deliverable_sent',
	'submit': 'deliverable_sent',
	'submitted': 'deliverable_sent',
	'finalize': 'deliverable_sent',
	'finalized': 'deliverable_sent',
	'complete': 'deliverable_sent',
	'completed': 'deliverable_sent',

	// Meeting prep
	'prep': 'meeting_prep',
	'prepare': 'meeting_prep',
	'prepared': 'meeting_prep',
	'meeting': 'meeting_prep',
	'call': 'meeting_prep',
	'presentation': 'meeting_prep',
	'agenda': 'meeting_prep'
};

/**
 * Keywords that exclude a task from mini-report consideration
 * These indicate routine/administrative work
 */
const EXCLUSION_KEYWORDS = [
	'update tracking',
	'tracking update',
	'update state',
	'state update',
	'email triage',
	'triage email',
	'status',
	'daily',
	'routine',
	'admin',
	'administrative',
	'housekeeping',
	'cleanup',
	'clean up',
	'organize',
	'reorganize',
	'update notes',
	'notes update',
	'file',
	'filing',
	'archive',
	'archiving',
	'sync',
	'backup'
];

// --- Helper Functions ---

/**
 * Check if a task name contains an exclusion keyword
 */
function containsExclusionKeyword(taskName: string): boolean {
	const lower = taskName.toLowerCase();
	return EXCLUSION_KEYWORDS.some(keyword => lower.includes(keyword));
}

/**
 * Find the reason for a mini-report based on inclusion keywords
 * Returns null if no matching keyword found
 */
function findReportReason(taskName: string): MiniReportCandidate['reason'] | null {
	const lower = taskName.toLowerCase();

	for (const [keyword, reason] of Object.entries(INCLUSION_KEYWORDS)) {
		if (lower.includes(keyword)) {
			return reason;
		}
	}

	return null;
}

/**
 * Get a human-readable label for a report reason
 */
export function getReasonLabel(reason: MiniReportCandidate['reason']): string {
	const labels: Record<MiniReportCandidate['reason'], string> = {
		'document_review': 'Review',
		'analysis_complete': 'Analysis',
		'deliverable_sent': 'Deliverable',
		'meeting_prep': 'Meeting Prep'
	};
	return labels[reason];
}

// --- Core Functions ---

/**
 * Identify completed tasks that should trigger a mini-report
 *
 * @param completed Recently completed tasks from dashboard state
 * @param dismissedFilenames Tasks the user has dismissed from suggestions
 * @param alreadySent Task filenames that have already had reports sent
 * @returns Array of mini-report candidates
 */
export function identifyMiniReportCandidates(
	completed: DashboardCompletedTask[] | undefined,
	dismissedFilenames: string[],
	alreadySent: string[]
): MiniReportCandidate[] {
	if (!completed || completed.length === 0) {
		return [];
	}

	const candidates: MiniReportCandidate[] = [];

	for (const task of completed) {
		// Skip if already dismissed or sent
		if (dismissedFilenames.includes(task.filename)) continue;
		if (alreadySent.includes(task.filename)) continue;

		// Skip if contains exclusion keyword
		if (containsExclusionKeyword(task.task)) continue;

		// Check for inclusion keyword
		const reason = findReportReason(task.task);
		if (!reason) continue;

		// Extract client/project from filename if possible
		// Assumes format like "TaskNote-ClientName-Description.md"
		const parts = task.filename.replace('.md', '').split('-');
		const client = parts.length > 1 ? parts[1] ?? 'Unknown' : 'Unknown';
		const project = parts.length > 2 ? parts.slice(2).join(' ') : '';

		candidates.push({
			taskName: task.task,
			filename: task.filename,
			completedDate: task.completedDate,
			client,
			project,
			reason
		});
	}

	return candidates;
}

/**
 * Generate a mini-report template for a candidate
 *
 * @param candidate The mini-report candidate
 * @returns Formatted template string
 */
export function generateMiniReportTemplate(candidate: MiniReportCandidate): string {
	const lines: string[] = [];

	const dateFormatted = new Date(candidate.completedDate + 'T12:00:00')
		.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

	lines.push(`Mini-Report: ${candidate.taskName}`);
	lines.push('');
	lines.push(`**Client:** ${candidate.client}`);
	if (candidate.project) {
		lines.push(`**Project:** ${candidate.project}`);
	}
	lines.push(`**Completed:** ${dateFormatted}`);
	lines.push(`**Type:** ${getReasonLabel(candidate.reason)}`);
	lines.push('');
	lines.push('**Summary:**');
	lines.push('- [What was accomplished]');
	lines.push('');
	lines.push('**Key Findings/Outcomes:**');
	lines.push('- [Main result or finding]');
	lines.push('');
	lines.push('**Next Steps (if any):**');
	lines.push('- [Follow-up items]');

	return lines.join('\n');
}
