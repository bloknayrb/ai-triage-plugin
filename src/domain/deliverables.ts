/**
 * Deliverable tracking domain logic
 * Pure TypeScript - no Obsidian dependencies for easy unit testing
 */

export type DeliverableType =
	| 'SDDD'
	| 'ICD'
	| 'TEST_PLAN'
	| 'OM_MANUAL'
	| 'CHANGE_ORDER'
	| 'TRAINING_MATERIAL'
	| 'AS_BUILT'
	| 'USER_GUIDE'
	| 'OTHER';

export type ClientCode = 'DRPA' | 'VDOT' | 'MDTA' | 'DelDOT';

/**
 * Default review periods in business days per deliverable type
 */
export const DEFAULT_REVIEW_PERIODS: Record<DeliverableType, number> = {
	SDDD: 15,
	ICD: 10,
	TEST_PLAN: 10,
	OM_MANUAL: 15,
	CHANGE_ORDER: 5,
	TRAINING_MATERIAL: 10,
	AS_BUILT: 10,
	USER_GUIDE: 10,
	OTHER: 10
};

/**
 * Client-specific overrides for review periods
 */
export const CLIENT_REVIEW_OVERRIDES: Record<ClientCode, Partial<Record<DeliverableType, number>>> = {
	DRPA: {
		SDDD: 15,
		ICD: 10,
		CHANGE_ORDER: 7
	},
	VDOT: {
		SDDD: 20,
		ICD: 15,
		TEST_PLAN: 10
	},
	MDTA: {
		SDDD: 15,
		ICD: 10
	},
	DelDOT: {
		SDDD: 15,
		ICD: 10
	}
};

/**
 * US Federal holidays that affect business day calculations
 */
export function getFederalHolidays(year: number): Date[] {
	const holidays: Date[] = [];

	// New Year's Day - January 1
	holidays.push(new Date(year, 0, 1));

	// MLK Day - Third Monday of January
	holidays.push(getNthWeekdayOfMonth(year, 0, 1, 3));

	// Presidents Day - Third Monday of February
	holidays.push(getNthWeekdayOfMonth(year, 1, 1, 3));

	// Memorial Day - Last Monday of May
	holidays.push(getLastWeekdayOfMonth(year, 4, 1));

	// Juneteenth - June 19
	holidays.push(new Date(year, 5, 19));

	// Independence Day - July 4
	holidays.push(new Date(year, 6, 4));

	// Labor Day - First Monday of September
	holidays.push(getNthWeekdayOfMonth(year, 8, 1, 1));

	// Columbus Day - Second Monday of October
	holidays.push(getNthWeekdayOfMonth(year, 9, 1, 2));

	// Veterans Day - November 11
	holidays.push(new Date(year, 10, 11));

	// Thanksgiving - Fourth Thursday of November
	holidays.push(getNthWeekdayOfMonth(year, 10, 4, 4));

	// Christmas - December 25
	holidays.push(new Date(year, 11, 25));

	return holidays;
}

/**
 * Get the nth weekday (0=Sun, 1=Mon, etc.) of a given month
 */
function getNthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
	const firstDay = new Date(year, month, 1);
	const firstWeekday = firstDay.getDay();
	let diff = weekday - firstWeekday;
	if (diff < 0) diff += 7;
	const dayOfMonth = 1 + diff + (n - 1) * 7;
	return new Date(year, month, dayOfMonth);
}

/**
 * Get the last weekday of a given month
 */
function getLastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
	const lastDay = new Date(year, month + 1, 0);
	const lastWeekday = lastDay.getDay();
	let diff = lastWeekday - weekday;
	if (diff < 0) diff += 7;
	return new Date(year, month + 1, -diff);
}

/**
 * Check if a date is a federal holiday
 */
export function isFederalHoliday(date: Date): boolean {
	const holidays = getFederalHolidays(date.getFullYear());
	return holidays.some(h =>
		h.getFullYear() === date.getFullYear() &&
		h.getMonth() === date.getMonth() &&
		h.getDate() === date.getDate()
	);
}

/**
 * Check if a date is a business day (Mon-Fri, not a holiday)
 */
export function isBusinessDay(date: Date): boolean {
	const day = date.getDay();
	if (day === 0 || day === 6) return false; // Weekend
	return !isFederalHoliday(date);
}

/**
 * Add business days to a date (skipping weekends and holidays)
 */
export function addBusinessDays(startDate: Date, businessDays: number): Date {
	const result = new Date(startDate);
	let daysAdded = 0;

	while (daysAdded < businessDays) {
		result.setDate(result.getDate() + 1);
		if (isBusinessDay(result)) {
			daysAdded++;
		}
	}

	return result;
}

/**
 * Count business days between two dates
 */
export function countBusinessDays(startDate: Date, endDate: Date): number {
	let count = 0;
	const current = new Date(startDate);

	while (current < endDate) {
		current.setDate(current.getDate() + 1);
		if (isBusinessDay(current)) {
			count++;
		}
	}

	return count;
}

/**
 * Calculate the review deadline for a deliverable submission
 */
export function calculateReviewDeadline(
	submissionDate: Date,
	deliverableType: DeliverableType,
	client?: ClientCode
): Date {
	// Get base review period
	let reviewDays = DEFAULT_REVIEW_PERIODS[deliverableType];

	// Apply client-specific override if available
	if (client && CLIENT_REVIEW_OVERRIDES[client]?.[deliverableType]) {
		reviewDays = CLIENT_REVIEW_OVERRIDES[client][deliverableType]!;
	}

	return addBusinessDays(submissionDate, reviewDays);
}

/**
 * Format a date as YYYY-MM-DD
 */
export function formatDate(date: Date): string {
	return date.toISOString().split('T')[0] ?? '';
}

/**
 * Generate the YAML frontmatter for a deliverable review TaskNote
 */
export function generateDeliverableFrontmatter(params: {
	title: string;
	deliverableType: DeliverableType;
	version?: string;
	vendor?: string;
	client: ClientCode;
	submissionDate: Date;
	reviewDeadline?: Date;
	contractReference?: string;
	project?: string;
	sourceFile?: string;
}): string {
	const deadline = params.reviewDeadline ??
		calculateReviewDeadline(params.submissionDate, params.deliverableType, params.client);

	return `---
title: "${escapeYamlString(params.title)}"
status: open
priority: high
client: ${params.client}
${params.project ? `project: "${escapeYamlString(params.project)}"` : ''}
task_type: deliverable_review
created: ${formatDate(new Date())}
due: ${formatDate(deadline)}
${params.sourceFile ? `source: "[[${params.sourceFile}]]"` : ''}
deliverable:
  id: "${params.deliverableType}-${formatDate(params.submissionDate)}"
  type: ${params.deliverableType}
  ${params.version ? `version: "${escapeYamlString(params.version)}"` : ''}
  ${params.vendor ? `vendor: ${params.vendor}` : ''}
  submission_date: ${formatDate(params.submissionDate)}
  review_deadline: ${formatDate(deadline)}
  ${params.contractReference ? `contract_reference: "${escapeYamlString(params.contractReference)}"` : ''}
  review_status: under_review
  escalation_level: 0
---`.replace(/\n{3,}/g, '\n').replace(/\n  \n/g, '\n');
}

/**
 * Generate full TaskNote content for a deliverable review
 */
export function generateDeliverableTaskNoteContent(params: {
	title: string;
	deliverableType: DeliverableType;
	version?: string;
	vendor?: string;
	client: ClientCode;
	submissionDate: Date;
	reviewDeadline?: Date;
	contractReference?: string;
	project?: string;
	sourceFile?: string;
	reasoning?: string;
}): string {
	const frontmatter = generateDeliverableFrontmatter(params);
	const deadline = params.reviewDeadline ??
		calculateReviewDeadline(params.submissionDate, params.deliverableType, params.client);

	let content = `${frontmatter}

# ${params.title}

**Type:** ${params.deliverableType}
${params.version ? `**Version:** ${params.version}` : ''}
${params.vendor ? `**Vendor:** ${params.vendor}` : ''}
**Client:** ${params.client}
**Submission Date:** ${formatDate(params.submissionDate)}
**Review Deadline:** ${formatDate(deadline)}

`;

	if (params.sourceFile) {
		content += `## Source

[[${params.sourceFile}]]

`;
	}

	if (params.reasoning) {
		content += `## Triage Reasoning

${params.reasoning}

`;
	}

	content += `## Review Checklist

### Format & Compliance
- [ ] Document format compliant with standards
- [ ] All required sections present
- [ ] Version control information correct
- [ ] Document numbering consistent

### Technical Content
- [ ] Technical approach sound
- [ ] Requirements addressed
- [ ] Interfaces defined correctly
- [ ] Dependencies identified

### Completeness
- [ ] All deliverable components included
- [ ] Supporting documentation attached
- [ ] Cross-references valid

## Review Comments

<!-- Add review comments here -->

## Recommendation

<!-- Add recommendation (Approve / Approve with Comments / Reject) -->
`;

	return content;
}

/**
 * Escape special characters for YAML strings
 */
function escapeYamlString(str: string): string {
	return str
		.replace(/\\/g, '\\\\')
		.replace(/"/g, '\\"')
		.replace(/\n/g, ' ')
		.replace(/\r/g, '');
}
