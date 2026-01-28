/**
 * Generic task generation for categories without specialized handlers
 * Pure TypeScript - no Obsidian dependencies
 */

import { ClientCode, formatDate } from './deliverables';

export type GenericTaskCategory =
	| 'SYSTEM_ISSUE'
	| 'MEETING_FOLLOWUP'
	| 'VENDOR_CORRESPONDENCE'
	| 'CLIENT_CORRESPONDENCE'
	| 'INFORMATIONAL'
	| 'UNCLEAR';

/**
 * Map category to task_type for frontmatter
 */
const CATEGORY_TO_TASK_TYPE: Record<GenericTaskCategory, string> = {
	'SYSTEM_ISSUE': 'system_issue',
	'MEETING_FOLLOWUP': 'meeting_followup',
	'VENDOR_CORRESPONDENCE': 'vendor_correspondence',
	'CLIENT_CORRESPONDENCE': 'client_correspondence',
	'INFORMATIONAL': 'informational',
	'UNCLEAR': 'general'
};

/**
 * Map category to default checklist items
 */
const CATEGORY_CHECKLISTS: Record<GenericTaskCategory, string[]> = {
	'SYSTEM_ISSUE': [
		'Identify root cause',
		'Document impact',
		'Coordinate with vendor',
		'Implement fix/workaround',
		'Verify resolution',
		'Document lessons learned'
	],
	'MEETING_FOLLOWUP': [
		'Review meeting notes',
		'Identify action items',
		'Assign responsibilities',
		'Set deadlines',
		'Schedule follow-up if needed'
	],
	'VENDOR_CORRESPONDENCE': [
		'Review vendor communication',
		'Identify required response/action',
		'Coordinate internally if needed',
		'Respond to vendor',
		'Document outcome'
	],
	'CLIENT_CORRESPONDENCE': [
		'Review client communication',
		'Identify client needs/concerns',
		'Coordinate response internally',
		'Respond to client',
		'Document outcome'
	],
	'INFORMATIONAL': [
		'Review information',
		'Determine if action needed',
		'Archive/file appropriately'
	],
	'UNCLEAR': [
		'Review source material',
		'Clarify requirements',
		'Determine appropriate action',
		'Complete action',
		'Document outcome'
	]
};

export interface GenericTaskParams {
	title: string;
	client?: ClientCode;
	priority: 'critical' | 'high' | 'medium' | 'low';
	dueDate?: Date;
	category: GenericTaskCategory;
	reasoning?: string;
	sourceFile?: string;
	project?: string;
	tags?: string[];
}

/**
 * Generate YAML frontmatter for a generic task
 */
export function generateGenericTaskFrontmatter(params: GenericTaskParams): string {
	const taskType = CATEGORY_TO_TASK_TYPE[params.category] || 'general';
	const tags = params.tags || [];

	// Add category-based tag if not already present
	const categoryTag = params.category.toLowerCase().replace(/_/g, '-');
	if (!tags.includes(categoryTag)) {
		tags.push(categoryTag);
	}

	const tagsYaml = tags.length > 0
		? `tags:\n${tags.map(t => `  - ${t}`).join('\n')}`
		: '';

	return `---
title: "${escapeYamlString(params.title)}"
status: open
priority: ${params.priority}
${params.client ? `client: ${params.client}` : ''}
${params.project ? `project: "${escapeYamlString(params.project)}"` : ''}
task_type: ${taskType}
created: ${formatDate(new Date())}
${params.dueDate ? `due: ${formatDate(params.dueDate)}` : ''}
${params.sourceFile ? `source: "[[${params.sourceFile}]]"` : ''}
${tagsYaml}
---`.replace(/\n{3,}/g, '\n\n').trim() + '\n---';
}

/**
 * Generate full TaskNote content for a generic task
 */
export function generateGenericTaskNoteContent(params: GenericTaskParams): string {
	const frontmatter = generateGenericTaskFrontmatter(params);
	const checklist = CATEGORY_CHECKLISTS[params.category] || CATEGORY_CHECKLISTS['UNCLEAR'];
	const categoryLabel = formatCategoryLabel(params.category);

	let content = `${frontmatter}

# ${params.title}

**Category:** ${categoryLabel}
${params.client ? `**Client:** ${params.client}` : ''}
${params.project ? `**Project:** ${params.project}` : ''}
**Priority:** ${params.priority}
${params.dueDate ? `**Due:** ${formatDate(params.dueDate)}` : ''}

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

	content += `## Checklist

${checklist.map(item => `- [ ] ${item}`).join('\n')}

## Notes

<!-- Add notes here -->
`;

	return content;
}

/**
 * Format category as human-readable label
 */
function formatCategoryLabel(category: GenericTaskCategory): string {
	const labels: Record<GenericTaskCategory, string> = {
		'SYSTEM_ISSUE': 'System Issue',
		'MEETING_FOLLOWUP': 'Meeting Follow-up',
		'VENDOR_CORRESPONDENCE': 'Vendor Correspondence',
		'CLIENT_CORRESPONDENCE': 'Client Correspondence',
		'INFORMATIONAL': 'Informational',
		'UNCLEAR': 'General Task'
	};
	return labels[category] || category;
}

/**
 * Escape special characters for YAML strings
 */
function escapeYamlString(str: string): string {
	// Escape backslashes, double quotes, and newlines
	return str
		.replace(/\\/g, '\\\\')
		.replace(/"/g, '\\"')
		.replace(/\n/g, ' ')
		.replace(/\r/g, '');
}
