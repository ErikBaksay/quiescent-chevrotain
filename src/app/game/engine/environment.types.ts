export const MINUTES_PER_DAY = 24 * 60;
export const DEFAULT_TIME_OF_DAY_MINUTES = 10 * 60 + 30;
export const DEFAULT_TIME_SCALE = 1;
export const TIME_SCALES = [0.25, 1, 4] as const;

// One complete in-game day takes twelve real minutes at 1× speed.
export const REAL_SECONDS_PER_GAME_DAY = 12 * 60;
export const GAME_MINUTES_PER_REAL_SECOND = MINUTES_PER_DAY / REAL_SECONDS_PER_GAME_DAY;

export type EnvironmentPhase = 'night' | 'dawn' | 'morning' | 'day' | 'golden-hour' | 'dusk';

export interface EnvironmentState {
  readonly timeOfDayMinutes: number;
  readonly paused: boolean;
  readonly timeScale: number;
  readonly phase: EnvironmentPhase;
}

export function normalizeTimeOfDay(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_TIME_OF_DAY_MINUTES;
  const normalized = minutes % MINUTES_PER_DAY;
  return normalized < 0 ? normalized + MINUTES_PER_DAY : normalized;
}

export function getEnvironmentPhase(minutes: number): EnvironmentPhase {
  const time = normalizeTimeOfDay(minutes);
  if (time < 5 * 60 || time >= 20 * 60) return 'night';
  if (time < 7 * 60) return 'dawn';
  if (time < 10 * 60) return 'morning';
  if (time < 16 * 60) return 'day';
  if (time < 18 * 60) return 'golden-hour';
  return 'dusk';
}

export function formatTimeOfDay(minutes: number): string {
  const time = Math.floor(normalizeTimeOfDay(minutes));
  const hours = Math.floor(time / 60);
  const minute = time % 60;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`;
}

export function environmentPhaseLabel(phase: EnvironmentPhase): string {
  switch (phase) {
    case 'golden-hour':
      return 'Golden hour';
    case 'night':
      return 'Night';
    case 'dawn':
      return 'Dawn';
    case 'morning':
      return 'Morning';
    case 'day':
      return 'Day';
    case 'dusk':
      return 'Dusk';
  }
}

export function createInitialEnvironmentState(): EnvironmentState {
  return {
    timeOfDayMinutes: DEFAULT_TIME_OF_DAY_MINUTES,
    paused: false,
    timeScale: DEFAULT_TIME_SCALE,
    phase: getEnvironmentPhase(DEFAULT_TIME_OF_DAY_MINUTES),
  };
}
