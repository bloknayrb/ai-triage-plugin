import { TriageSuggestion, TriageCategory } from '../triage-queue';

/**
 * System prompt with tolling domain knowledge
 */
export const TOLLING_TRIAGE_SYSTEM_PROMPT = `You are an AI assistant specialized in classifying incoming communications for a tolling program manager who works as an Owner's Representative on toll system projects.

## Domain Knowledge

### Clients (Toll Authorities)
- DRPA (Delaware River Port Authority) - operates toll bridges between NJ and PA
- VDOT (Virginia Department of Transportation) - Virginia tolling programs
- MDTA (Maryland Transportation Authority) - Maryland toll facilities
- DelDOT (Delaware Department of Transportation) - Delaware tolling

### Vendors
- TransCore - toll system integrator
- Conduent - back-office and CSC operations
- Kapsch - roadside equipment
- Neology - toll equipment

### Document Types
- SDDD (System Design Description Document) - 15 business day review
- ICD (Interface Control Document) - 10 business day review
- Test Plan - 10 business day review
- O&M Manual (Operations & Maintenance) - 15 business day review
- Change Order (CO) - 5-7 business day review

### Testing Phases
- FAT (Factory Acceptance Test) - at vendor facility
- IAT (Integration Acceptance Test) - system integration
- SAT (Site Acceptance Test) - on-site testing
- OAT (Operational Acceptance Test) - operational readiness
- UAT (User Acceptance Test) - user validation
- REGRESSION - regression testing

### Tolling Terminology
- Roadside: ETC (Electronic Toll Collection), AVI (Automatic Vehicle Identification), AVC (Automatic Vehicle Classification), DVAS (Digital Video Audit System), MOMS (Maintenance & Operations Management System), gantry, lane controller, toll zone
- Back-Office: BOS (Back-Office System), CSC (Customer Service Center), account management, violations, image review, OCR
- Interoperability: IAG (Interoperability Agreement Group), E-ZPass, SunPass, reciprocity, hub, file exchange

## Classification Categories

Classify each item into ONE of these categories:

1. DELIVERABLE_REVIEW - Vendor submittal requiring formal review (SDDD, ICD, Test Plan, O&M Manual)
2. CHANGE_ORDER - Contract modification request (look for CO number, proposed amount, scope change)
3. TESTING_MILESTONE - FAT/IAT/SAT/OAT/UAT coordination (scheduling, resources, results)
4. INTEROPERABILITY_ISSUE - IAG/reciprocity problems (CRITICAL if financial impact mentioned)
5. SYSTEM_ISSUE - Operational problems with toll systems
6. MEETING_FOLLOWUP - Meeting notes with action items
7. VENDOR_CORRESPONDENCE - General vendor communications
8. CLIENT_CORRESPONDENCE - Communications from toll authority clients
9. INFORMATIONAL - FYI only, no action required
10. UNCLEAR - Cannot determine, flag for human review

## Output Format

Respond with valid JSON only:
{
  "category": "CATEGORY_NAME",
  "title": "Brief descriptive title for task",
  "client": "DRPA|VDOT|MDTA|DelDOT|null",
  "priority": "critical|high|medium|low",
  "dueDate": "YYYY-MM-DD or null",
  "tags": ["array", "of", "tags"],
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of classification",
  "deliverable": { "type": "SDDD|ICD|etc", "version": "v1.0", "vendor": "TransCore", "reviewDeadline": "YYYY-MM-DD" },
  "changeOrder": { "coNumber": "CO-047", "proposedAmount": 125000, "affectedSystems": ["BOS", "Roadside"] },
  "testing": { "phase": "FAT|IAT|SAT|OAT|UAT", "scheduledStart": "YYYY-MM-DD", "scheduledEnd": "YYYY-MM-DD" },
  "interop": { "homeAgency": "DRPA", "awayAgency": "E-ZPass PA", "urgency": "critical|elevated|standard" }
}

Include only the relevant category-specific object (deliverable, changeOrder, testing, or interop).`;

/**
 * Build the user prompt for triage
 */
export function buildTriagePrompt(
	content: string,
	subject: string,
	defaultClient: string
): string {
	// Truncate very long content
	const maxContentLength = 8000;
	const truncatedContent = content.length > maxContentLength
		? content.substring(0, maxContentLength) + '\n\n[Content truncated...]'
		: content;

	return `${TOLLING_TRIAGE_SYSTEM_PROMPT}

## Item to Classify

Subject/Title: ${subject}
Default Client (if not detected): ${defaultClient}

Content:
---
${truncatedContent}
---

Classify this item and respond with JSON only.`;
}

/**
 * Parse the triage response from Ollama
 */
export function parseTriageResponse(response: string): TriageSuggestion | null {
	try {
		// Try to extract JSON from response
		let jsonStr = response;

		// Handle markdown code blocks
		const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
		if (jsonMatch?.[1]) {
			jsonStr = jsonMatch[1].trim();
		}

		// Handle raw JSON
		const braceMatch = response.match(/\{[\s\S]*\}/);
		if (braceMatch && !jsonMatch) {
			jsonStr = braceMatch[0];
		}

		const parsed = JSON.parse(jsonStr);

		// Validate required fields
		if (!parsed.category || !isValidCategory(parsed.category)) {
			console.warn('Invalid triage category:', parsed.category);
			return {
				category: 'UNCLEAR',
				title: parsed.title || 'Unknown',
				confidence: 0.3,
				reasoning: 'Could not parse valid category from AI response'
			};
		}

		return {
			category: parsed.category as TriageCategory,
			title: parsed.title || 'Untitled',
			client: parsed.client || undefined,
			priority: parsed.priority || 'medium',
			dueDate: parsed.dueDate || undefined,
			tags: Array.isArray(parsed.tags) ? parsed.tags : undefined,
			confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
			reasoning: parsed.reasoning || undefined,
			deliverable: parsed.deliverable || undefined,
			changeOrder: parsed.changeOrder || undefined,
			testing: parsed.testing || undefined,
			interop: parsed.interop || undefined
		};
	} catch (error) {
		console.error('Failed to parse triage response:', error, response);
		return {
			category: 'UNCLEAR',
			title: 'Parse Error',
			confidence: 0,
			reasoning: `Failed to parse AI response: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Validate that a string is a valid TriageCategory
 */
function isValidCategory(category: string): category is TriageCategory {
	const validCategories: TriageCategory[] = [
		'DELIVERABLE_REVIEW',
		'CHANGE_ORDER',
		'TESTING_MILESTONE',
		'INTEROPERABILITY_ISSUE',
		'SYSTEM_ISSUE',
		'MEETING_FOLLOWUP',
		'VENDOR_CORRESPONDENCE',
		'CLIENT_CORRESPONDENCE',
		'INFORMATIONAL',
		'UNCLEAR'
	];
	return validCategories.includes(category as TriageCategory);
}
