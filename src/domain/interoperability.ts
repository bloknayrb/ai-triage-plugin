/**
 * Interoperability (IAG) issue tracking domain logic
 * Pure TypeScript - no Obsidian dependencies
 */

import { ClientCode, formatDate } from './deliverables';

export type InteropIssueType =
	| 'iag_file_error'
	| 'reciprocity_failure'
	| 'hub_down'
	| 'tag_read_error'
	| 'duplicate_charge'
	| 'missing_transaction'
	| 'agency_code_invalid'
	| 'format_error'
	| 'niop_update'
	| 'other';

export type InteropUrgency = 'critical' | 'elevated' | 'standard';

/**
 * Patterns that indicate critical interoperability issues
 */
export const CRITICAL_INTEROP_PATTERNS = [
	/iag\s*file\s*(missing|rejected|failed)/i,
	/reciprocity\s*(failure|failed|down)/i,
	/hub\s*(down|offline|unavailable)/i,
	/missing\s*transactions?/i,
	/duplicate\s*charges?/i,
	/revenue\s*(discrepancy|loss|impact)/i,
	/financial\s*impact/i,
	/\$[\d,]+\s*(impact|loss|discrepancy)/i
];

/**
 * Patterns that indicate elevated interoperability issues
 */
export const ELEVATED_INTEROP_PATTERNS = [
	/format\s*(issue|error|problem)/i,
	/tag\s*read\s*(problem|error|issue)/i,
	/agency\s*code\s*(invalid|unknown)/i,
	/niop\s*update/i,
	/interop\s*(issue|problem)/i
];

/**
 * Known E-ZPass and toll agencies
 */
export const KNOWN_AGENCIES = [
	'E-ZPass PA',
	'E-ZPass NJ',
	'E-ZPass NY',
	'E-ZPass DE',
	'E-ZPass MD',
	'E-ZPass VA',
	'E-ZPass NC',
	'E-ZPass WV',
	'E-ZPass OH',
	'E-ZPass IN',
	'E-ZPass IL',
	'E-ZPass ME',
	'E-ZPass NH',
	'E-ZPass MA',
	'SunPass',
	'Peach Pass',
	'TxTag',
	'NTTA',
	'PikePass'
];

/**
 * Detect if content has potential financial impact
 */
export function detectFinancialImpact(content: string): boolean {
	const financialPatterns = [
		/\$[\d,]+/,
		/revenue/i,
		/financial/i,
		/monetary/i,
		/cost/i,
		/billing/i,
		/invoice/i,
		/payment/i
	];

	return financialPatterns.some(pattern => pattern.test(content));
}

/**
 * Detect interoperability issue urgency from content
 */
export function detectInteropUrgency(content: string): InteropUrgency {
	// Check for critical patterns first
	for (const pattern of CRITICAL_INTEROP_PATTERNS) {
		if (pattern.test(content)) {
			return 'critical';
		}
	}

	// Check for elevated patterns
	for (const pattern of ELEVATED_INTEROP_PATTERNS) {
		if (pattern.test(content)) {
			return 'elevated';
		}
	}

	// If financial impact detected, elevate to at least elevated
	if (detectFinancialImpact(content)) {
		return 'elevated';
	}

	return 'standard';
}

/**
 * Extract agency names from content
 */
export function extractAgencies(content: string): string[] {
	const found: string[] = [];

	for (const agency of KNOWN_AGENCIES) {
		// Create regex that handles variations (E-ZPass, EZPass, E ZPass)
		const pattern = new RegExp(agency.replace(/-/g, '[- ]?'), 'i');
		if (pattern.test(content)) {
			found.push(agency);
		}
	}

	return found;
}

/**
 * Extract potential transaction count from content
 */
export function extractTransactionCount(content: string): number | null {
	const patterns = [
		/(\d[\d,]*)\s*transactions?/i,
		/transactions?:\s*(\d[\d,]*)/i,
		/(\d[\d,]*)\s*records?/i,
		/records?:\s*(\d[\d,]*)/i
	];

	for (const pattern of patterns) {
		const match = content.match(pattern);
		if (match?.[1]) {
			return parseInt(match[1].replace(/,/g, ''), 10);
		}
	}

	return null;
}

/**
 * Extract potential dollar amount from content
 */
export function extractDollarAmount(content: string): number | null {
	const patterns = [
		/\$\s*([\d,]+(?:\.\d{2})?)/,
		/([\d,]+(?:\.\d{2})?)\s*dollars?/i
	];

	for (const pattern of patterns) {
		const match = content.match(pattern);
		if (match?.[1]) {
			return parseFloat(match[1].replace(/,/g, ''));
		}
	}

	return null;
}

/**
 * Generate YAML frontmatter for an interoperability issue TaskNote
 */
export function generateInteropIssueFrontmatter(params: {
	title: string;
	issueType: InteropIssueType;
	homeAgency: ClientCode | string;
	awayAgency: string;
	affectedDateRange?: { start: Date; end: Date };
	estimatedTransactionCount?: number;
	estimatedRevenueImpact?: number;
	vendorResponsible?: string;
	iagFileIds?: string[];
	client: ClientCode;
}): string {
	const urgency = params.estimatedRevenueImpact && params.estimatedRevenueImpact > 10000
		? 'critical'
		: params.estimatedRevenueImpact
			? 'elevated'
			: 'standard';

	const priority = urgency === 'critical' ? 'critical' : urgency === 'elevated' ? 'high' : 'medium';

	return `---
title: "${params.title}"
status: open
priority: ${priority}
client: ${params.client}
task_type: interoperability_issue
created: ${formatDate(new Date())}
tags:
  - interoperability
${urgency === 'critical' ? '  - urgent-financial' : ''}
interop:
  issue_type: ${params.issueType}
  home_agency: "${params.homeAgency}"
  away_agency: "${params.awayAgency}"
${params.affectedDateRange ? `  affected_date_range:
    start: ${formatDate(params.affectedDateRange.start)}
    end: ${formatDate(params.affectedDateRange.end)}` : ''}
${params.estimatedTransactionCount ? `  estimated_transaction_count: ${params.estimatedTransactionCount}` : ''}
${params.estimatedRevenueImpact ? `  estimated_revenue_impact: ${params.estimatedRevenueImpact}` : ''}
${params.vendorResponsible ? `  vendor_responsible: ${params.vendorResponsible}` : ''}
${params.iagFileIds?.length ? `  iag_file_ids:
${params.iagFileIds.map(id => `    - "${id}"`).join('\n')}` : ''}
  urgency: ${urgency}
---`;
}

/**
 * Generate full TaskNote content for an interoperability issue
 */
export function generateInteropIssueContent(params: {
	title: string;
	issueType: InteropIssueType;
	homeAgency: ClientCode | string;
	awayAgency: string;
	description?: string;
	affectedDateRange?: { start: Date; end: Date };
	estimatedTransactionCount?: number;
	estimatedRevenueImpact?: number;
	vendorResponsible?: string;
	iagFileIds?: string[];
	client: ClientCode;
}): string {
	const frontmatter = generateInteropIssueFrontmatter(params);
	const urgency = params.estimatedRevenueImpact && params.estimatedRevenueImpact > 10000
		? 'CRITICAL'
		: params.estimatedRevenueImpact
			? 'ELEVATED'
			: 'STANDARD';

	return `${frontmatter}

# ${params.title}

${urgency === 'CRITICAL' ? '⚠️ **CRITICAL - FINANCIAL IMPACT**\n' : ''}
**Issue Type:** ${params.issueType.replace(/_/g, ' ')}
**Home Agency:** ${params.homeAgency}
**Away Agency:** ${params.awayAgency}
${params.affectedDateRange ? `**Affected Period:** ${formatDate(params.affectedDateRange.start)} to ${formatDate(params.affectedDateRange.end)}` : ''}
${params.estimatedTransactionCount ? `**Est. Transactions:** ${params.estimatedTransactionCount.toLocaleString()}` : ''}
${params.estimatedRevenueImpact ? `**Est. Revenue Impact:** $${params.estimatedRevenueImpact.toLocaleString()}` : ''}
${params.vendorResponsible ? `**Vendor Responsible:** ${params.vendorResponsible}` : ''}

## Description

${params.description ?? 'No description provided.'}

## IAG File IDs

${params.iagFileIds?.length ? params.iagFileIds.map(id => `- \`${id}\``).join('\n') : 'None specified'}

## Investigation Steps

- [ ] Identify affected files/transactions
- [ ] Determine root cause
- [ ] Assess financial impact
- [ ] Coordinate with away agency
- [ ] Implement correction
- [ ] Verify resolution
- [ ] Document lessons learned

## Resolution

<!-- Document resolution steps and outcome here -->

## Notes

<!-- Add notes here -->
`;
}
