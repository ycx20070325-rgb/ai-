export enum GameState {
  IDLE = 'IDLE',
  GENERATING_TARGET = 'GENERATING_TARGET',
  PLAYING = 'PLAYING',
  SCORING = 'SCORING', // Intermediate state while checking frame
  SUCCESS_ANIMATION = 'SUCCESS_ANIMATION',
  FINISHED = 'FINISHED',
  ERROR = 'ERROR'
}

export enum Difficulty {
  EASY = 'EASY',
  MEDIUM = 'MEDIUM',
  HARD = 'HARD'
}

export interface GameLevel {
  id: number;
  description: string;
  targetImageBase64: string | null;
  userMatchImageBase64: string | null;
}

export interface ComparisonResult {
  score: number; // 0-100
  feedback: string;
}

export interface GameHistory {
  timestamp: number;
  score: number;
  difficulty: Difficulty;
}
