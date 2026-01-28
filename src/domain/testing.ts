/**
 * Testing milestone tracking domain logic
 * Pure TypeScript - no Obsidian dependencies
 */

import { ClientCode, formatDate } from './deliverables';

export type TestPhase =
	| 'FAT'      // Factory Acceptance Test
	| 'IAT'      // Integration Acceptance Test
	| 'SAT'      // Site Acceptance Test
	| 'OAT'      // Operational Acceptance Test
	| 'UAT'      // User Acceptance Test
	| 'REGRESSION';

export type TestStatus =
	| 'scheduled'
	| 'in_progress'
	| 'passed'
	| 'failed'
	| 'deferred'
	| 'blocked';

export interface TestPhaseDefinition {
	phase: TestPhase;
	fullName: string;
	description: string;
	location: string;
	prerequisites: string[];
	stakeholders: string[];
	successCriteria: string[];
	typicalDuration: string;
}

/**
 * Definitions for each test phase
 */
export const TEST_PHASE_DEFINITIONS: Record<TestPhase, TestPhaseDefinition> = {
	FAT: {
		phase: 'FAT',
		fullName: 'Factory Acceptance Test',
		description: 'Vendor facility testing to verify system meets specifications before shipment',
		location: 'Vendor facility',
		prerequisites: [
			'Hardware/software build complete',
			'FAT test plan approved',
			'Test environment configured',
			'Test data prepared'
		],
		stakeholders: ['Vendor QA', 'OR Representative', 'Client (optional)'],
		successCriteria: [
			'All test cases executed',
			'Critical defects resolved',
			'Test report approved',
			'Shipping authorization obtained'
		],
		typicalDuration: '1-2 weeks'
	},

	IAT: {
		phase: 'IAT',
		fullName: 'Integration Acceptance Test',
		description: 'Testing of integrated system components and interfaces',
		location: 'Integration lab or staging environment',
		prerequisites: [
			'FAT passed',
			'All components integrated',
			'Interface specifications finalized',
			'IAT test plan approved'
		],
		stakeholders: ['Vendor Integration Team', 'OR Representative', 'System Architect'],
		successCriteria: [
			'All interfaces validated',
			'Data flows verified end-to-end',
			'Performance within specifications',
			'Integration defects resolved'
		],
		typicalDuration: '2-3 weeks'
	},

	SAT: {
		phase: 'SAT',
		fullName: 'Site Acceptance Test',
		description: 'On-site testing at deployment location to verify installation',
		location: 'Production site',
		prerequisites: [
			'IAT passed',
			'Site infrastructure ready',
			'Equipment installed',
			'Network connectivity verified'
		],
		stakeholders: ['Vendor Field Team', 'OR Representative', 'Client Operations', 'Site Manager'],
		successCriteria: [
			'All equipment operational',
			'Site-specific configurations verified',
			'Environmental conditions validated',
			'Site acceptance signed'
		],
		typicalDuration: '1-2 weeks per site'
	},

	OAT: {
		phase: 'OAT',
		fullName: 'Operational Acceptance Test',
		description: 'Testing under operational conditions to verify system readiness',
		location: 'Production environment',
		prerequisites: [
			'SAT passed',
			'Operations staff trained',
			'O&M procedures documented',
			'Support systems ready'
		],
		stakeholders: ['Operations Team', 'OR Representative', 'Client Operations', 'Vendor Support'],
		successCriteria: [
			'System handles operational load',
			'Failover/recovery tested',
			'Operations staff certified',
			'Go-live readiness confirmed'
		],
		typicalDuration: '2-4 weeks'
	},

	UAT: {
		phase: 'UAT',
		fullName: 'User Acceptance Test',
		description: 'End-user validation that system meets business requirements',
		location: 'Production or staging environment',
		prerequisites: [
			'OAT passed or in progress',
			'UAT test scenarios defined',
			'End users identified and trained',
			'Test accounts created'
		],
		stakeholders: ['End Users', 'Business Analysts', 'OR Representative', 'Client Project Manager'],
		successCriteria: [
			'Business scenarios validated',
			'User feedback incorporated',
			'Acceptance criteria met',
			'Sign-off obtained'
		],
		typicalDuration: '1-2 weeks'
	},

	REGRESSION: {
		phase: 'REGRESSION',
		fullName: 'Regression Testing',
		description: 'Re-testing after changes to ensure existing functionality still works',
		location: 'Test environment',
		prerequisites: [
			'Change implemented',
			'Regression test suite updated',
			'Test environment refreshed'
		],
		stakeholders: ['QA Team', 'Development Team', 'OR Representative'],
		successCriteria: [
			'No regression defects',
			'All critical paths verified',
			'Performance unchanged'
		],
		typicalDuration: '3-5 days'
	}
};

/**
 * Generate YAML frontmatter for a testing milestone TaskNote
 */
export function generateTestingMilestoneFrontmatter(params: {
	title: string;
	phase: TestPhase;
	testId?: string;
	description?: string;
	scheduledStart: Date;
	scheduledEnd: Date;
	vendor?: string;
	vendorLead?: string;
	orLead?: string;
	testEnvironment?: string;
	client: ClientCode;
	prerequisites?: string[];
}): string {
	const definition = TEST_PHASE_DEFINITIONS[params.phase];
	const prereqs = params.prerequisites ?? definition.prerequisites;

	return `---
title: "${params.title}"
status: open
priority: high
client: ${params.client}
task_type: testing_milestone
created: ${formatDate(new Date())}
due: ${formatDate(params.scheduledStart)}
testing:
  phase: ${params.phase}
  ${params.testId ? `test_id: "${params.testId}"` : ''}
  description: "${params.description ?? definition.description}"
  scheduled_start: ${formatDate(params.scheduledStart)}
  scheduled_end: ${formatDate(params.scheduledEnd)}
  status: scheduled
  test_cases_total: 0
  test_cases_executed: 0
  test_cases_passed: 0
  ${params.vendor ? `vendor: ${params.vendor}` : ''}
  ${params.vendorLead ? `vendor_lead: "${params.vendorLead}"` : ''}
  ${params.orLead ? `or_lead: "${params.orLead}"` : ''}
  ${params.testEnvironment ? `test_environment: "${params.testEnvironment}"` : ''}
  test_data_prepared: false
  prerequisites:
${prereqs.map(p => `    - "${p}"`).join('\n')}
---`;
}

/**
 * Generate full TaskNote content for a testing milestone
 */
export function generateTestingMilestoneContent(params: {
	title: string;
	phase: TestPhase;
	testId?: string;
	description?: string;
	scheduledStart: Date;
	scheduledEnd: Date;
	vendor?: string;
	vendorLead?: string;
	orLead?: string;
	testEnvironment?: string;
	client: ClientCode;
	prerequisites?: string[];
}): string {
	const frontmatter = generateTestingMilestoneFrontmatter(params);
	const definition = TEST_PHASE_DEFINITIONS[params.phase];

	return `${frontmatter}

# ${params.title}

**Phase:** ${definition.fullName} (${params.phase})
**Dates:** ${formatDate(params.scheduledStart)} to ${formatDate(params.scheduledEnd)}
**Duration:** ${definition.typicalDuration}
**Location:** ${definition.location}

## Description

${params.description ?? definition.description}

## Prerequisites

${(params.prerequisites ?? definition.prerequisites).map(p => `- [ ] ${p}`).join('\n')}

## Stakeholders

${definition.stakeholders.map(s => `- ${s}`).join('\n')}
${params.vendorLead ? `- Vendor Lead: ${params.vendorLead}` : ''}
${params.orLead ? `- OR Lead: ${params.orLead}` : ''}

## Success Criteria

${definition.successCriteria.map(c => `- [ ] ${c}`).join('\n')}

## Test Execution Log

| Date | Test Case | Result | Notes |
|------|-----------|--------|-------|
| | | | |

## Issues / Defects

<!-- Log any issues discovered during testing -->

## Notes

<!-- Add notes here -->
`;
}
