import { describe, it, expect } from 'vitest';
import {
  getEscalationLevel,
  getEscalationRule,
  checkDeliverableEscalations,
  formatEscalationNotification,
  DELIVERABLE_ESCALATION_RULES,
  type EscalatableTask,
} from '../src/domain/escalation';

describe('escalation', () => {
  describe('getEscalationLevel', () => {
    it('should return level 0 for 0 days overdue', () => {
      expect(getEscalationLevel(0)).toBe(0);
    });

    it('should return level 1 for 1 day overdue', () => {
      expect(getEscalationLevel(1)).toBe(1);
    });

    it('should return level 2 for 3 days overdue', () => {
      expect(getEscalationLevel(3)).toBe(2);
    });

    it('should return level 3 for 5 days overdue', () => {
      expect(getEscalationLevel(5)).toBe(3);
    });

    it('should return level 4 for 10 days overdue', () => {
      expect(getEscalationLevel(10)).toBe(4);
    });

    it('should return level 5 for 15+ days overdue', () => {
      expect(getEscalationLevel(15)).toBe(5);
      expect(getEscalationLevel(30)).toBe(5);
    });

    it('should return highest matching level', () => {
      expect(getEscalationLevel(7)).toBe(3); // Between 5 and 10
    });
  });

  describe('getEscalationRule', () => {
    it('should return rule for valid level', () => {
      const rule = getEscalationRule(3);
      expect(rule).toBeDefined();
      expect(rule?.level).toBe(3);
      expect(rule?.priority).toBe('critical');
    });

    it('should return undefined for invalid level', () => {
      const rule = getEscalationRule(99 as any);
      expect(rule).toBeUndefined();
    });
  });

  describe('checkDeliverableEscalations', () => {
    it('should return empty array for no tasks', () => {
      const actions = checkDeliverableEscalations([]);
      expect(actions.length).toBe(0);
    });

    it('should skip completed tasks', () => {
      const tasks: EscalatableTask[] = [{
        id: '1',
        title: 'Test',
        dueDate: new Date(2026, 0, 1),
        status: 'done',
        escalationLevel: 0,
      }];
      const actions = checkDeliverableEscalations(tasks, new Date(2026, 0, 20));
      expect(actions.length).toBe(0);
    });

    it('should skip tasks not yet due', () => {
      const tasks: EscalatableTask[] = [{
        id: '1',
        title: 'Test',
        dueDate: new Date(2026, 1, 1), // Feb 1
        status: 'open',
        escalationLevel: 0,
      }];
      const actions = checkDeliverableEscalations(tasks, new Date(2026, 0, 15)); // Jan 15
      expect(actions.length).toBe(0);
    });

    it('should return escalation action for overdue task', () => {
      const tasks: EscalatableTask[] = [{
        id: '1',
        title: 'Review SDDD',
        dueDate: new Date(2026, 0, 5), // Jan 5
        status: 'open',
        escalationLevel: 0,
      }];
      // Jan 20 = ~11 business days overdue (level 4)
      const actions = checkDeliverableEscalations(tasks, new Date(2026, 0, 20));
      expect(actions.length).toBe(1);
      expect(actions[0].taskId).toBe('1');
      expect(actions[0].newLevel).toBeGreaterThan(0);
    });

    it('should not escalate if already at correct level', () => {
      const tasks: EscalatableTask[] = [{
        id: '1',
        title: 'Test',
        dueDate: new Date(2026, 0, 5),
        status: 'open',
        escalationLevel: 5, // Already at max
      }];
      const actions = checkDeliverableEscalations(tasks, new Date(2026, 0, 30));
      expect(actions.length).toBe(0);
    });
  });

  describe('formatEscalationNotification', () => {
    it('should format notification correctly', () => {
      const rule = getEscalationRule(3)!;
      const notification = formatEscalationNotification({
        taskId: '1',
        taskTitle: 'Review SDDD Chapter 9',
        currentLevel: 2,
        newLevel: 3,
        daysOverdue: 5,
        rule,
        dueDate: new Date(2026, 0, 5),
      });

      expect(notification).toContain('ESCALATION');
      expect(notification).toContain('Review SDDD Chapter 9');
      expect(notification).toContain('Level 2 → 3');
      expect(notification).toContain('5 business days overdue');
      expect(notification).toContain('CRITICAL');
    });
  });

  describe('DELIVERABLE_ESCALATION_RULES', () => {
    it('should have 6 levels (0-5)', () => {
      expect(DELIVERABLE_ESCALATION_RULES.length).toBe(6);
    });

    it('should have increasing trigger days', () => {
      for (let i = 1; i < DELIVERABLE_ESCALATION_RULES.length; i++) {
        expect(DELIVERABLE_ESCALATION_RULES[i].triggerDaysOverdue)
          .toBeGreaterThan(DELIVERABLE_ESCALATION_RULES[i-1].triggerDaysOverdue);
      }
    });

    it('level 0 should have medium priority', () => {
      expect(DELIVERABLE_ESCALATION_RULES[0].priority).toBe('medium');
    });

    it('level 3+ should have critical priority', () => {
      expect(DELIVERABLE_ESCALATION_RULES[3].priority).toBe('critical');
      expect(DELIVERABLE_ESCALATION_RULES[4].priority).toBe('critical');
      expect(DELIVERABLE_ESCALATION_RULES[5].priority).toBe('critical');
    });
  });
});
