import { describe, it, expect } from 'vitest';
import {
  hasModuleAccess,
  hasAnyModuleAccess,
  DASHBOARD_GRID_MODULES,
  QUICK_ACTIONS,
  STAT_CARDS,
  ALL_MODULES,
} from '@/lib/modules';

describe('modules utility', () => {
  it('ALL_MODULES is a non-empty array', () => {
    expect(Array.isArray(ALL_MODULES)).toBe(true);
    expect(ALL_MODULES.length).toBeGreaterThan(0);
  });

  it('ALL_MODULES items have required fields', () => {
    for (const mod of ALL_MODULES) {
      expect(mod.key).toBeTruthy();
      expect(mod.label).toBeTruthy();
      expect(mod.href).toBeTruthy();
    }
  });

  it('returns dashboard grid modules', () => {
    expect(Array.isArray(DASHBOARD_GRID_MODULES)).toBe(true);
    expect(DASHBOARD_GRID_MODULES.length).toBeGreaterThan(0);
  });

  it('returns quick actions', () => {
    expect(Array.isArray(QUICK_ACTIONS)).toBe(true);
    expect(QUICK_ACTIONS.length).toBeGreaterThan(0);
  });

  it('returns stat cards', () => {
    expect(Array.isArray(STAT_CARDS)).toBe(true);
    expect(STAT_CARDS.every(card => card.statKey && card.label)).toBe(true);
  });

  it('hasModuleAccess returns false for null user', () => {
    expect(hasModuleAccess(null, 'tasks')).toBe(false);
  });

  it('hasModuleAccess returns false for undefined user', () => {
    expect(hasModuleAccess(undefined, 'tasks')).toBe(false);
  });

  it('hasAnyModuleAccess returns false for null user', () => {
    expect(hasAnyModuleAccess(null, ['tasks', 'assets'])).toBe(false);
  });
});