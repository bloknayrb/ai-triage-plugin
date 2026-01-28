/**
 * Deadline escalation domain logic
 * Pure TypeScript - no Obsidian dependencies
 */

import { countBusinessDays } from './deliverables';

export type EscalationLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface EscalationRule {
	level: EscalationLevel;
	triggerDaysOverdue: number;
	priority: 'low' | 'medium' | 'high' | 'critical';
	notifyRoles: string[];
	actions: string[];
}

/**
 * Escalation rules for deliverable reviews
 * Level increases as item becomes more overdue
 */
export const DELIVERABLE_ESCALATION_RULES: EscalationRule[] = [
	{
		level: 0,
		triggerDaysOverdue: 0,
		priority: 'medium',
		notifyRoles: ['OR Reviewer'],
		actions: ['Review in progress']
	},
	{
		level: 1,
		triggerDaysOverdue: 1,
		priority: 'high',
		notifyRoles: ['OR Reviewer', 'OR Project Manager'],
		actions: ['Send reminder to reviewer', 'Update status in weekly report']
	},
	{
		level: 2,
		triggerDaysOverdue: 3,
		priority: 'high',
		notifyRoles: ['OR Reviewer', 'OR Project Manager', 'OR Director'],
		actions: ['Escalate to PM', 'Document delay reason', 'Revise delivery estimate']
	},
	{
		level: 3,
		triggerDaysOverdue: 5,
		priority: 'critical',
		notifyRoles: ['OR Project Manager', 'OR Director', 'Client PM'],
		actions: ['Notify client', 'Provide new deadline', 'Document in risk log']
	},
	{
		level: 4,
		triggerDaysOverdue: 10,
		priority: 'critical',
		notifyRoles: ['OR Director', 'Client PM', 'Client Director'],
		actions: ['Formal escalation notice', 'Recovery plan required', 'Executive briefing']
	},
	{
		level: 5,
		triggerDaysOverdue: 15,
		priority: 'critical',
		notifyRoles: ['OR Executive', 'Client Executive'],
		actions: ['Executive intervention', 'Contract impact assessment', 'Remediation plan']
	}
];

export interface EscalationAction {
	taskId: string;
	taskTitle: string;
	currentLevel: EscalationLevel;
	newLevel: EscalationLevel;
	daysOverdue: number;
	rule: EscalationRule;
	dueDate: Date;
}

/**
 * Determine escalation level based on days overdue
 */
export function getEscalationLevel(daysOverdue: number): EscalationLevel {
	// Find highest matching rule
	for (let i = DELIVERABLE_ESCALATION_RULES.length - 1; i >= 0; i--) {
		const rule = DELIVERABLE_ESCALATION_RULES[i];
		if (rule && daysOverdue >= rule.triggerDaysOverdue) {
			return rule.level;
		}
	}
	return 0;
}

/**
 * Get the escalation rule for a given level
 */
export function getEscalationRule(level: EscalationLevel): EscalationRule | undefined {
	return DELIVERABLE_ESCALATION_RULES.find(r => r.level === level);
}

/**
 * Task interface for escalation checking
 */
export interface EscalatableTask {
	id: string;
	title: string;
	dueDate: Date;
	status: string;
	escalationLevel?: EscalationLevel;
}

/**
 * Check all tasks for escalation actions needed
 */
export function checkDeliverableEscalations(
	tasks: EscalatableTask[],
	currentDate: Date = new Date()
): EscalationAction[] {
	const actions: EscalationAction[] = [];

	for (const task of tasks) {
		// Skip completed tasks
		if (task.status === 'done' || task.status === 'completed' || task.status === 'closed') {
			continue;
		}

		// Skip tasks not yet due
		if (task.dueDate > currentDate) {
			continue;
		}

		// Calculate days overdue (business days)
		const daysOverdue = countBusinessDays(task.dueDate, currentDate);
		const currentLevel = task.escalationLevel ?? 0;
		const newLevel = getEscalationLevel(daysOverdue);

		// Check if escalation needed
		if (newLevel > currentLevel) {
			const rule = getEscalationRule(newLevel);
			if (rule) {
				actions.push({
					taskId: task.id,
					taskTitle: task.title,
					currentLevel,
					newLevel,
					daysOverdue,
					rule,
					dueDate: task.dueDate
				});
			}
		}
	}

	return actions;
}

/**
 * Format escalation action for notification
 */
export function formatEscalationNotification(action: EscalationAction): string {
	return `⚠️ ESCALATION: "${action.taskTitle}"
Level ${action.currentLevel} → ${action.newLevel}
${action.daysOverdue} business days overdue (due: ${action.dueDate.toLocaleDateString()})
Priority: ${action.rule.priority.toUpperCase()}
Actions Required:
${action.rule.actions.map(a => `  • ${a}`).join('\n')}
Notify: ${action.rule.notifyRoles.join(', ')}`;
}

/**
 * Generate escalation summary for multiple tasks
 */
export function generateEscalationSummary(actions: EscalationAction[]): string {
	if (actions.length === 0) {
		return 'No escalations required.';
	}

	const critical = actions.filter(a => a.rule.priority === 'critical');
	const high = actions.filter(a => a.rule.priority === 'high');

	let summary = `# Escalation Summary\n\n`;
	summary += `Total items requiring escalation: ${actions.length}\n`;
	summary += `- Critical: ${critical.length}\n`;
	summary += `- High: ${high.length}\n\n`;

	if (critical.length > 0) {
		summary += `## Critical Escalations\n\n`;
		for (const action of critical) {
			summary += `### ${action.taskTitle}\n`;
			summary += `- Days Overdue: ${action.daysOverdue}\n`;
			summary += `- Escalation Level: ${action.newLevel}\n`;
			summary += `- Due Date: ${action.dueDate.toLocaleDateString()}\n`;
			summary += `- Actions: ${action.rule.actions.join(', ')}\n\n`;
		}
	}

	if (high.length > 0) {
		summary += `## High Priority Escalations\n\n`;
		for (const action of high) {
			summary += `### ${action.taskTitle}\n`;
			summary += `- Days Overdue: ${action.daysOverdue}\n`;
			summary += `- Escalation Level: ${action.newLevel}\n`;
			summary += `- Due Date: ${action.dueDate.toLocaleDateString()}\n\n`;
		}
	}

	return summary;
}
