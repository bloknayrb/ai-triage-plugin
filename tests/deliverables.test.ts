import { describe, it, expect } from 'vitest';
import {
  getFederalHolidays,
  isFederalHoliday,
  isBusinessDay,
  addBusinessDays,
  countBusinessDays,
  calculateReviewDeadline,
  formatDate,
  DEFAULT_REVIEW_PERIODS,
  CLIENT_REVIEW_OVERRIDES,
} from '../src/domain/deliverables';

describe('deliverables', () => {
  describe('getFederalHolidays', () => {
    it('should return 11 federal holidays for any year', () => {
      const holidays2026 = getFederalHolidays(2026);
      expect(holidays2026.length).toBe(11);
    });

    it('should include New Year\'s Day', () => {
      const holidays = getFederalHolidays(2026);
      const newYears = holidays.find(h => h.getMonth() === 0 && h.getDate() === 1);
      expect(newYears).toBeDefined();
    });

    it('should include Christmas', () => {
      const holidays = getFederalHolidays(2026);
      const christmas = holidays.find(h => h.getMonth() === 11 && h.getDate() === 25);
      expect(christmas).toBeDefined();
    });

    it('should include MLK Day (3rd Monday of January)', () => {
      const holidays = getFederalHolidays(2026);
      // In 2026, MLK Day is January 19
      const mlk = holidays.find(h => h.getMonth() === 0 && h.getDate() === 19);
      expect(mlk).toBeDefined();
    });
  });

  describe('isFederalHoliday', () => {
    it('should return true for Christmas 2026', () => {
      expect(isFederalHoliday(new Date(2026, 11, 25))).toBe(true);
    });

    it('should return false for a regular day', () => {
      expect(isFederalHoliday(new Date(2026, 0, 15))).toBe(false);
    });
  });

  describe('isBusinessDay', () => {
    it('should return false for Saturday', () => {
      // January 3, 2026 is a Saturday
      expect(isBusinessDay(new Date(2026, 0, 3))).toBe(false);
    });

    it('should return false for Sunday', () => {
      // January 4, 2026 is a Sunday
      expect(isBusinessDay(new Date(2026, 0, 4))).toBe(false);
    });

    it('should return true for a regular weekday', () => {
      // January 5, 2026 is a Monday
      expect(isBusinessDay(new Date(2026, 0, 5))).toBe(true);
    });

    it('should return false for Christmas (even if weekday)', () => {
      // December 25, 2026 is a Friday
      expect(isBusinessDay(new Date(2026, 11, 25))).toBe(false);
    });
  });

  describe('addBusinessDays', () => {
    it('should add business days correctly', () => {
      // Start: Monday Jan 5, 2026, add 5 business days = Friday Jan 12
      // (skipping weekend Jan 10-11)
      const start = new Date(2026, 0, 5);
      const result = addBusinessDays(start, 5);
      expect(result.getDate()).toBe(12);
      expect(result.getMonth()).toBe(0);
    });

    it('should skip weekends', () => {
      // Start: Friday Jan 2, 2026, add 1 business day = Monday Jan 5
      const start = new Date(2026, 0, 2);
      const result = addBusinessDays(start, 1);
      expect(result.getDate()).toBe(5);
    });

    it('should skip holidays', () => {
      // Start: Dec 23, 2026 (Wednesday), add 2 business days
      // Dec 24 = Thursday (business day), Dec 25 = Friday (Christmas - holiday)
      // Dec 26 = Saturday (weekend), Dec 27 = Sunday (weekend)
      // Dec 28 = Monday (business day)
      // So 2 business days = Dec 24 + Dec 28
      const start = new Date(2026, 11, 23);
      const result = addBusinessDays(start, 2);
      expect(result.getDate()).toBe(28);
    });
  });

  describe('countBusinessDays', () => {
    it('should count business days between two dates', () => {
      // Jan 5 (Mon) to Jan 9 (Fri) = 4 business days
      const start = new Date(2026, 0, 5);
      const end = new Date(2026, 0, 9);
      expect(countBusinessDays(start, end)).toBe(4);
    });

    it('should exclude weekends from count', () => {
      // Jan 5 (Mon) to Jan 12 (Mon) = 5 business days (Jan 6-9 + Jan 12)
      const start = new Date(2026, 0, 5);
      const end = new Date(2026, 0, 12);
      expect(countBusinessDays(start, end)).toBe(5);
    });
  });

  describe('calculateReviewDeadline', () => {
    it('should use default review period for SDDD (15 days)', () => {
      const submission = new Date(2026, 0, 5); // Monday
      const deadline = calculateReviewDeadline(submission, 'SDDD');
      // 15 business days from Jan 5, accounting for weekends and MLK Day (Jan 19)
      expect(deadline.getMonth()).toBe(0);
      expect(deadline.getDate()).toBe(27);
    });

    it('should use client override for VDOT SDDD (20 days)', () => {
      const submission = new Date(2026, 0, 5);
      const deadline = calculateReviewDeadline(submission, 'SDDD', 'VDOT');
      // 20 business days from Jan 5, accounting for weekends and MLK Day
      expect(deadline.getMonth()).toBe(1); // February
      expect(deadline.getDate()).toBe(3);
    });

    it('should use shorter period for ICD (10 days)', () => {
      expect(DEFAULT_REVIEW_PERIODS['ICD']).toBe(10);
    });
  });

  describe('formatDate', () => {
    it('should format date as YYYY-MM-DD', () => {
      const date = new Date(2026, 0, 15);
      expect(formatDate(date)).toBe('2026-01-15');
    });
  });

  describe('CLIENT_REVIEW_OVERRIDES', () => {
    it('should have DRPA overrides', () => {
      expect(CLIENT_REVIEW_OVERRIDES['DRPA']).toBeDefined();
      expect(CLIENT_REVIEW_OVERRIDES['DRPA']['CHANGE_ORDER']).toBe(7);
    });

    it('should have VDOT overrides with longer SDDD period', () => {
      expect(CLIENT_REVIEW_OVERRIDES['VDOT']['SDDD']).toBe(20);
    });
  });
});
