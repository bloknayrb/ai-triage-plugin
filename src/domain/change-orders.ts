/**
 * Change order review domain logic
 * Pure TypeScript - no Obsidian dependencies
 */

import { ClientCode, formatDate, addBusinessDays } from './deliverables';

export type ChangeOrderLifecycleStage =
	| 'submitted'
	| 'technical_review'
	| 'cost_review'
	| 'recommendation'
	| 'client_decision'
	| 'approved'
	| 'rejected'
	| 'withdrawn';

export type CostType = 'fixed_price' | 'time_and_materials' | 'unit_price' | 'other';

export interface ChangeOrderReviewItem {
	category: string;
	item: string;
	checked: boolean | null; // null = not yet reviewed
	notes?: string;
}

/**
 * Standard change order review checklist
 */
export const CHANGE_ORDER_REVIEW_CHECKLIST: ChangeOrderReviewItem[] = [
	// Technical Review
	{ category: 'Technical', item: 'Scope clearly defined', checked: null },
	{ category: 'Technical', item: 'Within contract scope', checked: null },
	{ category: 'Technical', item: 'Technical approach sound', checked: null },

	// Schedule Review
	{ category: 'Schedule', item: 'Schedule impact identified', checked: null },
	{ category: 'Schedule', item: 'Schedule impact acceptable', checked: null },
	{ category: 'Schedule', item: 'Critical path affected', checked: null },

	// Cost Review
	{ category: 'Cost', item: 'Cost breakdown provided', checked: null },
	{ category: 'Cost', item: 'Labor rates per contract', checked: null },
	{ category: 'Cost', item: 'Cost reasonable', checked: null },

	// Contractual Review
	{ category: 'Contractual', item: 'Documentation complete', checked: null },
	{ category: 'Contractual', item: 'Properly authorized', checked: null },
	{ category: 'Contractual', item: 'No scope creep', checked: null }
];

/**
 * Default review period for change orders in business days
 */
export const DEFAULT_CO_REVIEW_DAYS = 5;

/**
 * Client-specific CO review periods
 */
export const CLIENT_CO_REVIEW_DAYS: Record<ClientCode, number> = {
	DRPA: 7,
	VDOT: 5,
	MDTA: 5,
	DelDOT: 5
};

/**
 * Systems that can be affected by change orders
 */
export type AffectedSystem =
	| 'Roadside'
	| 'BOS'
	| 'CSC'
	| 'MOMS'
	| 'DVAS'
	| 'Interoperability'
	| 'Network'
	| 'Security'
	| 'Reporting'
	| 'Other';

/**
 * Calculate CO review deadline
 */
export function calculateCOReviewDeadline(submissionDate: Date, client?: ClientCode): Date {
	const reviewDays = client ? CLIENT_CO_REVIEW_DAYS[client] : DEFAULT_CO_REVIEW_DAYS;
	return addBusinessDays(submissionDate, reviewDays);
}

/**
 * Generate markdown content for CO review checklist
 */
export function generateCOChecklistMarkdown(): string {
	const lines: string[] = ['## Review Checklist', ''];

	let currentCategory = '';
	for (const item of CHANGE_ORDER_REVIEW_CHECKLIST) {
		if (item.category !== currentCategory) {
			currentCategory = item.category;
			lines.push(`### ${currentCategory}`);
		}
		lines.push(`- [ ] ${item.item}`);
	}

	return lines.join('\n');
}

/**
 * Generate YAML frontmatter for a change order review TaskNote
 */
export function generateChangeOrderFrontmatter(params: {
	title: string;
	coNumber: string;
	vendor: string;
	client: ClientCode;
	submissionDate: Date;
	proposedAmount: number;
	costType?: CostType;
	description?: string;
	affectedSystems?: AffectedSystem[];
	contractReference?: string;
}): string {
	const deadline = calculateCOReviewDeadline(params.submissionDate, params.client);

	const affectedSystemsYaml = params.affectedSystems?.length
		? `\n  affected_systems:\n${params.affectedSystems.map(s => `    - ${s}`).join('\n')}`
		: '';

	return `---
title: "${params.title}"
status: open
priority: high
client: ${params.client}
task_type: change_order_review
created: ${formatDate(new Date())}
due: ${formatDate(deadline)}
change_order:
  co_number: "${params.coNumber}"
  vendor: ${params.vendor}
  submission_date: ${formatDate(params.submissionDate)}
  review_deadline: ${formatDate(deadline)}
  proposed_amount: ${params.proposedAmount}
  currency: USD
  cost_type: ${params.costType ?? 'fixed_price'}
  ${params.description ? `description: "${params.description}"` : ''}${affectedSystemsYaml}
  ${params.contractReference ? `contract_reference: "${params.contractReference}"` : ''}
  lifecycle_stage: technical_review
---`;
}

/**
 * Generate full TaskNote content for a change order review
 */
export function generateChangeOrderTaskNoteContent(params: {
	title: string;
	coNumber: string;
	vendor: string;
	client: ClientCode;
	submissionDate: Date;
	proposedAmount: number;
	costType?: CostType;
	description?: string;
	affectedSystems?: AffectedSystem[];
	contractReference?: string;
}): string {
	const frontmatter = generateChangeOrderFrontmatter(params);
	const checklist = generateCOChecklistMarkdown();

	return `${frontmatter}

# ${params.title}

**CO Number:** ${params.coNumber}
**Vendor:** ${params.vendor}
**Proposed Amount:** $${params.proposedAmount.toLocaleString()}
**Cost Type:** ${params.costType ?? 'Fixed Price'}

${params.description ? `## Description\n\n${params.description}\n` : ''}
${params.affectedSystems?.length ? `## Affected Systems\n\n${params.affectedSystems.map(s => `- ${s}`).join('\n')}\n` : ''}
${checklist}

## Notes

<!-- Add review notes here -->

## Recommendation

<!-- Add recommendation here -->
`;
}
