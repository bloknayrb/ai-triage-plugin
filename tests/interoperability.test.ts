import { describe, it, expect } from 'vitest';
import {
  detectFinancialImpact,
  detectInteropUrgency,
  extractAgencies,
  extractTransactionCount,
  extractDollarAmount,
  CRITICAL_INTEROP_PATTERNS,
  ELEVATED_INTEROP_PATTERNS,
} from '../src/domain/interoperability';

describe('interoperability', () => {
  describe('detectFinancialImpact', () => {
    it('should detect dollar amounts', () => {
      expect(detectFinancialImpact('The total is $5,000')).toBe(true);
    });

    it('should detect revenue mentions', () => {
      expect(detectFinancialImpact('This affects revenue')).toBe(true);
    });

    it('should detect billing mentions', () => {
      expect(detectFinancialImpact('Check the billing system')).toBe(true);
    });

    it('should return false for non-financial content', () => {
      expect(detectFinancialImpact('The system is running fine')).toBe(false);
    });
  });

  describe('detectInteropUrgency', () => {
    it('should detect critical: IAG file missing', () => {
      expect(detectInteropUrgency('The IAG file is missing from the hub')).toBe('critical');
    });

    it('should detect critical: reciprocity failure', () => {
      expect(detectInteropUrgency('Reciprocity failure with E-ZPass PA')).toBe('critical');
    });

    it('should detect critical: hub down', () => {
      expect(detectInteropUrgency('The hub is down')).toBe('critical');
    });

    it('should detect critical: missing transactions', () => {
      expect(detectInteropUrgency('We have missing transactions')).toBe('critical');
    });

    it('should detect critical: revenue discrepancy', () => {
      expect(detectInteropUrgency('There is a revenue discrepancy of $50,000')).toBe('critical');
    });

    it('should detect elevated: format issue', () => {
      expect(detectInteropUrgency('There is a format issue in the file')).toBe('elevated');
    });

    it('should detect elevated: tag read problem', () => {
      expect(detectInteropUrgency('Tag read problem reported')).toBe('elevated');
    });

    it('should detect elevated: NIOP update', () => {
      expect(detectInteropUrgency('NIOP update required')).toBe('elevated');
    });

    it('should elevate to elevated if financial impact detected', () => {
      expect(detectInteropUrgency('General issue affecting billing')).toBe('elevated');
    });

    it('should return standard for non-urgent content', () => {
      expect(detectInteropUrgency('General status update')).toBe('standard');
    });
  });

  describe('extractAgencies', () => {
    it('should extract E-ZPass PA', () => {
      const agencies = extractAgencies('Issue with E-ZPass PA transactions');
      expect(agencies).toContain('E-ZPass PA');
    });

    it('should extract multiple agencies', () => {
      const agencies = extractAgencies('Transfer from E-ZPass NJ to E-ZPass PA');
      expect(agencies).toContain('E-ZPass NJ');
      expect(agencies).toContain('E-ZPass PA');
    });

    it('should handle variations like EZPass', () => {
      const agencies = extractAgencies('EZPass PA account');
      expect(agencies).toContain('E-ZPass PA');
    });

    it('should extract SunPass', () => {
      const agencies = extractAgencies('SunPass interoperability');
      expect(agencies).toContain('SunPass');
    });

    it('should return empty array for no agencies', () => {
      const agencies = extractAgencies('General tolling discussion');
      expect(agencies.length).toBe(0);
    });
  });

  describe('extractTransactionCount', () => {
    it('should extract transaction count', () => {
      expect(extractTransactionCount('Affected 15,000 transactions')).toBe(15000);
    });

    it('should extract from "transactions:" format', () => {
      expect(extractTransactionCount('Transactions: 5000')).toBe(5000);
    });

    it('should extract records count', () => {
      expect(extractTransactionCount('Missing 1,234 records')).toBe(1234);
    });

    it('should return null if no count found', () => {
      expect(extractTransactionCount('Some transactions affected')).toBeNull();
    });
  });

  describe('extractDollarAmount', () => {
    it('should extract dollar amount with $', () => {
      expect(extractDollarAmount('Impact of $45,000')).toBe(45000);
    });

    it('should extract amount with cents', () => {
      expect(extractDollarAmount('Total $1,234.56')).toBe(1234.56);
    });

    it('should extract "dollars" format', () => {
      expect(extractDollarAmount('About 5000 dollars')).toBe(5000);
    });

    it('should return null if no amount found', () => {
      expect(extractDollarAmount('Significant financial impact')).toBeNull();
    });
  });

  describe('CRITICAL_INTEROP_PATTERNS', () => {
    it('should have patterns for critical issues', () => {
      expect(CRITICAL_INTEROP_PATTERNS.length).toBeGreaterThan(0);
    });

    it('patterns should be RegExp', () => {
      CRITICAL_INTEROP_PATTERNS.forEach(pattern => {
        expect(pattern).toBeInstanceOf(RegExp);
      });
    });
  });

  describe('ELEVATED_INTEROP_PATTERNS', () => {
    it('should have patterns for elevated issues', () => {
      expect(ELEVATED_INTEROP_PATTERNS.length).toBeGreaterThan(0);
    });
  });
});
