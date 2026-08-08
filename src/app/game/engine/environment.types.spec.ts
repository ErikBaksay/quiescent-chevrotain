import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIME_OF_DAY_MINUTES,
  environmentPhaseLabel,
  formatTimeOfDay,
  getEnvironmentPhase,
  normalizeTimeOfDay,
} from './environment.types';

describe('environment time model', () => {
  it('normalizes clock values across midnight', () => {
    expect(normalizeTimeOfDay(-1)).toBe(1_439);
    expect(normalizeTimeOfDay(1_440)).toBe(0);
    expect(normalizeTimeOfDay(Number.NaN)).toBe(DEFAULT_TIME_OF_DAY_MINUTES);
  });

  it('formats 24-hour values for the compact control', () => {
    expect(formatTimeOfDay(0)).toBe('12:00 AM');
    expect(formatTimeOfDay(630)).toBe('10:30 AM');
    expect(formatTimeOfDay(720)).toBe('12:00 PM');
    expect(formatTimeOfDay(1_439)).toBe('11:59 PM');
  });

  it('classifies the important daylight transitions', () => {
    expect(getEnvironmentPhase(4 * 60 + 59)).toBe('night');
    expect(getEnvironmentPhase(6 * 60)).toBe('dawn');
    expect(getEnvironmentPhase(8 * 60)).toBe('morning');
    expect(getEnvironmentPhase(12 * 60)).toBe('day');
    expect(getEnvironmentPhase(17 * 60)).toBe('golden-hour');
    expect(getEnvironmentPhase(19 * 60)).toBe('dusk');
    expect(environmentPhaseLabel('golden-hour')).toBe('Golden hour');
  });
});
