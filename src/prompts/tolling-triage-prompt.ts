import { z } from 'zod';
import { TriageSuggestion, TriageCategory } from '../triage-queue';

/**
 * Zod schema for validating triage response from AI
 * This provides runtime type safety for untrusted input
 */
const TriageCategorySchema = z.enum([
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
]);

const TriageResponseSchema = z.object({
	category: TriageCategorySchema,
	title: z.string().min(1).max(500),
	client: z.string().optional(),
	priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
	dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
	tags: z.array(z.string().max(100)).max(20).optional(),
	confidence: z.number().min(0).max(1),
	reasoning: z.string().max(2000).optional(),
	deliverable: z.object({
		type: z.string(),
		version: z.string().optional(),
		vendor: z.string().optional(),
		reviewDeadline: z.string().optional()
	}).optional(),
	changeOrder: z.object({
		coNumber: z.string().optional(),
		proposedAmount: z.number().optional(),
		affectedSystems: z.array(z.string()).optional()
	}).optional(),
	testing: z.object({
		phase: z.string().optional(),
		scheduledStart: z.string().optional(),
		scheduledEnd: z.string().optional()
	}).optional(),
	interop: z.object({
		homeAgency: z.string().optional(),
		awayAgency: z.string().optional(),
		urgency: z.enum(['critical', 'elevated', 'standard']).optional()
	}).optional()
});

/**
 * System prompt with comprehensive tolling domain knowledge
 * Tailored for Bryan Kolb's role as Technical Specialist at RK&K
 */
export const TOLLING_TRIAGE_SYSTEM_PROMPT = `You are an AI assistant for Bryan Kolb, a Technical Specialist at RK&K working as an Owner's Representative on toll system projects in the Mid-Atlantic region.

## Your Role Context

Bryan's responsibilities:
- Vendor oversight and deliverable reviews
- Requirements development (currently leading VDOT NIOP)
- Contract/RFP support
- Multi-stakeholder coordination across 4 active clients

Internal team:
- Jeremy Siviter: Boss/Senior Consultant - requests from Jeremy are high priority
- Heather Henck: Senior Project Delivery Leader

## Active Clients

### DRPA (Delaware River Port Authority)
- Toll bridges between NJ and PA
- Current projects: General oversight, IAG 1.6 cutover, ICD implementation
- Key contacts: Kathy Camack, Ken Straub, Jack Peffer
- Status: YELLOW - approaching ICD Go-Live milestone

### VDOT (Virginia Department of Transportation)
- Virginia statewide electronic toll collection (16 facilities)
- Current projects: CSC RFP (completed), CSC Ops Support, NIOP Interoperability
- Key contacts: Brendan Kelleher, Ginny Griffin, Rob Cafaro, Linda Sexton
- Status: RED - Bryan is LEAD on NIOP, critical deadlines
- IMPORTANT: Any item mentioning "NIOP" is HIGH priority by default

### DelDOT (Delaware Department of Transportation)
- Delaware toll facilities including US 301
- Current projects: Toll System Integration, Cost Analysis, AI-TOMS
- Key contacts: Jim Burnett, Steve Hamilton, Randy Brown
- Status: YELLOW - awaiting contract decision

### MDTA (Maryland Transportation Authority)
- Maryland electronic toll collection
- Current projects: 4G Equipment Procurement
- Key contacts: Shannon Orange, Wei Lin
- Status: STALLED - monitoring reconciliation issues

## Vendors

- TransCore: Primary toll system integrator - FAT/SAT testing, change orders
- Conduent: Back-office and CSC operations
- Kapsch: Roadside equipment
- Neology: Toll equipment
- Faneuil: CSC benchmarking

## Document Types & Review Periods

- SDDD (System Design Description Document): 15 business days
- ICD (Interface Control Document): 10 business days
- Test Plan: 10 business days
- O&M Manual: 15 business days
- Change Order (CO): 5-7 business days

## Testing Phases

- FAT (Factory Acceptance Test): vendor facility
- IAT (Integration Acceptance Test): system integration
- SAT (Site Acceptance Test): on-site
- OAT (Operational Acceptance Test): operational readiness
- UAT (User Acceptance Test): user validation

## Tolling Terminology

- Roadside: ETC, AVI, AVC, DVAS, MOMS, gantry, lane controller, toll zone
- Back-Office: BOS, CSC, account management, violations, image review, OCR
- Interoperability: IAG, E-ZPass, SunPass, reciprocity, hub, file exchange

## Priority Rules

CRITICAL:
- Go-live dates within 2 weeks
- System outages affecting revenue

HIGH:
- NIOP-related items (Bryan is lead)
- Messages from @rkk.com domain (internal team)
- Messages from verified client domains (@drpa.org, @vdot.virginia.gov, @deldot.gov, @mdta.maryland.gov)
- Deliverables with deadline within 5 business days
- Testing milestone coordination

MEDIUM:
- Standard deliverable reviews
- Routine vendor correspondence
- Meeting follow-ups with action items

LOW:
- Informational items
- FYI-only communications
- Items for other team members

## Classification Categories

1. DELIVERABLE_REVIEW - Vendor submittal requiring formal review
2. CHANGE_ORDER - Contract modification request
3. TESTING_MILESTONE - FAT/IAT/SAT/OAT/UAT coordination
4. INTEROPERABILITY_ISSUE - IAG/reciprocity problems
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
  "deliverable": { "type": "...", "version": "...", "vendor": "...", "reviewDeadline": "..." },
  "changeOrder": { "coNumber": "...", "proposedAmount": ..., "affectedSystems": [...] },
  "testing": { "phase": "...", "scheduledStart": "...", "scheduledEnd": "..." },
  "interop": { "homeAgency": "...", "awayAgency": "...", "urgency": "..." }
}

Include only the relevant category-specific object.`;

/**
 * Build the user prompt for triage
 * @param content The content to classify
 * @param subject Subject line or title
 * @param defaultClient Fallback client if not detected
 * @param dynamicContext Optional dynamic context from triage-context.md
 */
export function buildTriagePrompt(
	content: string,
	subject: string,
	defaultClient: string,
	dynamicContext?: string
): string {
	// Truncate very long content
	const maxContentLength = 8000;
	const truncatedContent = content.length > maxContentLength
		? content.substring(0, maxContentLength) + '\n\n[Content truncated...]'
		: content;

	// Inject context with structural delimiters if present
	// Using XML-style tags to clearly delineate user-provided context
	const contextSection = dynamicContext
		? `\n<user_context>\n${dynamicContext}\n</user_context>\n`
		: '';

	return `${TOLLING_TRIAGE_SYSTEM_PROMPT}${contextSection}

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
 * Parse the triage response from Ollama with Zod validation
 * Provides runtime type safety for untrusted AI output
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

		// Validate with Zod schema - provides runtime type safety
		const validation = TriageResponseSchema.safeParse(parsed);

		if (!validation.success) {
			// Log detailed validation errors for debugging
			console.warn('Triage response validation failed:', validation.error.issues);

			// Try to salvage what we can
			const category = isValidCategory(parsed.category) ? parsed.category : 'UNCLEAR';
			return {
				category: category as TriageCategory,
				title: typeof parsed.title === 'string' ? parsed.title.slice(0, 500) : 'Unknown',
				confidence: 0.3,
				reasoning: `Validation failed: ${validation.error.issues.map(i => i.message).join('; ')}`
			};
		}

		const data = validation.data;

		return {
			category: data.category as TriageCategory,
			title: data.title,
			client: data.client,
			priority: data.priority || 'medium',
			dueDate: data.dueDate ?? undefined,
			tags: data.tags,
			confidence: data.confidence,
			reasoning: data.reasoning,
			deliverable: data.deliverable,
			changeOrder: data.changeOrder,
			testing: data.testing,
			interop: data.interop
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
 * Validate that a string is a valid TriageCategory using Zod
 */
function isValidCategory(category: string): category is TriageCategory {
	return TriageCategorySchema.safeParse(category).success;
}
