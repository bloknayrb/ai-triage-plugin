import { describe, it, expect } from 'vitest';
import {
  buildTriagePrompt,
  parseTriageResponse,
  TOLLING_TRIAGE_SYSTEM_PROMPT,
} from '../src/prompts/tolling-triage-prompt';

describe('tolling-triage-prompt', () => {
  describe('TOLLING_TRIAGE_SYSTEM_PROMPT', () => {
    it('should contain client information', () => {
      expect(TOLLING_TRIAGE_SYSTEM_PROMPT).toContain('DRPA');
      expect(TOLLING_TRIAGE_SYSTEM_PROMPT).toContain('VDOT');
      expect(TOLLING_TRIAGE_SYSTEM_PROMPT).toContain('MDTA');
      expect(TOLLING_TRIAGE_SYSTEM_PROMPT).toContain('DelDOT');
    });

    it('should contain vendor information', () => {
      expect(TOLLING_TRIAGE_SYSTEM_PROMPT).toContain('TransCore');
      expect(TOLLING_TRIAGE_SYSTEM_PROMPT).toContain('Conduent');
      expect(TOLLING_TRIAGE_SYSTEM_PROMPT).toContain('Kapsch');
    });

    it('should contain document types', () => {
      expect(TOLLING_TRIAGE_SYSTEM_PROMPT).toContain('SDDD');
      expect(TOLLING_TRIAGE_SYSTEM_PROMPT).toContain('ICD');
      expect(TOLLING_TRIAGE_SYSTEM_PROMPT).toContain('Test Plan');
    });

    it('should contain testing phases', () => {
      expect(TOLLING_TRIAGE_SYSTEM_PROMPT).toContain('FAT');
      expect(TOLLING_TRIAGE_SYSTEM_PROMPT).toContain('IAT');
      expect(TOLLING_TRIAGE_SYSTEM_PROMPT).toContain('SAT');
      expect(TOLLING_TRIAGE_SYSTEM_PROMPT).toContain('OAT');
    });

    it('should contain all classification categories', () => {
      expect(TOLLING_TRIAGE_SYSTEM_PROMPT).toContain('DELIVERABLE_REVIEW');
      expect(TOLLING_TRIAGE_SYSTEM_PROMPT).toContain('CHANGE_ORDER');
      expect(TOLLING_TRIAGE_SYSTEM_PROMPT).toContain('TESTING_MILESTONE');
      expect(TOLLING_TRIAGE_SYSTEM_PROMPT).toContain('INTEROPERABILITY_ISSUE');
      expect(TOLLING_TRIAGE_SYSTEM_PROMPT).toContain('UNCLEAR');
    });
  });

  describe('buildTriagePrompt', () => {
    it('should include content', () => {
      const prompt = buildTriagePrompt('Test content', 'Test Subject', 'DRPA');
      expect(prompt).toContain('Test content');
    });

    it('should include subject', () => {
      const prompt = buildTriagePrompt('Content', 'My Subject', 'DRPA');
      expect(prompt).toContain('My Subject');
    });

    it('should include default client', () => {
      const prompt = buildTriagePrompt('Content', 'Subject', 'VDOT');
      expect(prompt).toContain('VDOT');
    });

    it('should truncate very long content', () => {
      const longContent = 'x'.repeat(10000);
      const prompt = buildTriagePrompt(longContent, 'Subject', 'DRPA');
      expect(prompt).toContain('[Content truncated...]');
      expect(prompt.length).toBeLessThan(longContent.length + 5000);
    });

    it('should include system prompt', () => {
      const prompt = buildTriagePrompt('Content', 'Subject', 'DRPA');
      expect(prompt).toContain('Classification Categories');
    });
  });

  describe('parseTriageResponse', () => {
    it('should parse valid JSON response', () => {
      const response = JSON.stringify({
        category: 'DELIVERABLE_REVIEW',
        title: 'Review SDDD',
        client: 'DRPA',
        priority: 'high',
        confidence: 0.9,
      });

      const result = parseTriageResponse(response);
      expect(result).not.toBeNull();
      expect(result?.category).toBe('DELIVERABLE_REVIEW');
      expect(result?.title).toBe('Review SDDD');
      expect(result?.client).toBe('DRPA');
      expect(result?.confidence).toBe(0.9);
    });

    it('should parse JSON in markdown code block', () => {
      const response = '```json\n{"category": "CHANGE_ORDER", "title": "CO-047", "confidence": 0.8}\n```';

      const result = parseTriageResponse(response);
      expect(result).not.toBeNull();
      expect(result?.category).toBe('CHANGE_ORDER');
    });

    it('should parse JSON in plain code block', () => {
      const response = '```\n{"category": "TESTING_MILESTONE", "title": "SAT Phase 2", "confidence": 0.7}\n```';

      const result = parseTriageResponse(response);
      expect(result).not.toBeNull();
      expect(result?.category).toBe('TESTING_MILESTONE');
    });

    it('should extract JSON from mixed content', () => {
      const response = 'Here is my analysis:\n{"category": "INFORMATIONAL", "title": "FYI", "confidence": 0.6}\nDone.';

      const result = parseTriageResponse(response);
      expect(result).not.toBeNull();
      expect(result?.category).toBe('INFORMATIONAL');
    });

    it('should return UNCLEAR for invalid category', () => {
      const response = JSON.stringify({
        category: 'INVALID_CATEGORY',
        title: 'Test',
        confidence: 0.5,
      });

      const result = parseTriageResponse(response);
      expect(result?.category).toBe('UNCLEAR');
    });

    it('should return UNCLEAR for missing category', () => {
      const response = JSON.stringify({
        title: 'Test',
        confidence: 0.5,
      });

      const result = parseTriageResponse(response);
      expect(result?.category).toBe('UNCLEAR');
    });

    it('should handle malformed JSON gracefully', () => {
      const response = 'This is not JSON at all';

      const result = parseTriageResponse(response);
      expect(result?.category).toBe('UNCLEAR');
      expect(result?.confidence).toBe(0);
    });

    it('should parse deliverable-specific fields', () => {
      const response = JSON.stringify({
        category: 'DELIVERABLE_REVIEW',
        title: 'SDDD Review',
        confidence: 0.9,
        deliverable: {
          type: 'SDDD',
          version: 'Rev 3',
          vendor: 'TransCore',
        },
      });

      const result = parseTriageResponse(response);
      expect(result?.deliverable?.type).toBe('SDDD');
      expect(result?.deliverable?.vendor).toBe('TransCore');
    });

    it('should parse change order fields', () => {
      const response = JSON.stringify({
        category: 'CHANGE_ORDER',
        title: 'CO-047',
        confidence: 0.85,
        changeOrder: {
          coNumber: 'CO-047',
          proposedAmount: 125000,
          affectedSystems: ['BOS', 'Roadside'],
        },
      });

      const result = parseTriageResponse(response);
      expect(result?.changeOrder?.coNumber).toBe('CO-047');
      expect(result?.changeOrder?.proposedAmount).toBe(125000);
    });

    it('should parse interop fields with urgency', () => {
      const response = JSON.stringify({
        category: 'INTEROPERABILITY_ISSUE',
        title: 'IAG File Error',
        confidence: 0.95,
        interop: {
          homeAgency: 'DRPA',
          awayAgency: 'E-ZPass PA',
          urgency: 'critical',
        },
      });

      const result = parseTriageResponse(response);
      expect(result?.interop?.urgency).toBe('critical');
      expect(result?.interop?.homeAgency).toBe('DRPA');
    });

    it('should set default confidence if not provided', () => {
      const response = JSON.stringify({
        category: 'INFORMATIONAL',
        title: 'Test',
      });

      const result = parseTriageResponse(response);
      expect(result?.confidence).toBe(0.5);
    });

    it('should set default priority if not provided', () => {
      const response = JSON.stringify({
        category: 'INFORMATIONAL',
        title: 'Test',
        confidence: 0.5,
      });

      const result = parseTriageResponse(response);
      expect(result?.priority).toBe('medium');
    });
  });
});
