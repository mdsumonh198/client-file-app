export interface GameConfig {
  numberFrom: number;
  numberTo: number;
  ticketSize: number;
  resultSize: number;
}

export type TargetMap = Record<number, number>; // exact k -> minimum count

export type SolverStatus =
  | 'PROVED OPTIMAL'
  | 'BEST FOUND'
  | 'INFEASIBLE'
  | 'TIMEOUT'
  | 'RUNNING'
  | 'READY';

export interface ExactMatchStat {
  k: number;
  min: number;
  max: number;
  avg: number;
  worstResult: number[];
  bestResult: number[];
  requiredTarget?: number;
  passed?: boolean;
}

export interface VerificationReport {
  totalTickets: number;
  totalResultsChecked: number;
  stats: Record<number, ExactMatchStat>;
  allTargetsPass: boolean;
  worstCaseOverallResult?: number[];
  bestCaseOverallResult?: number[];
}

export interface OptimizationResult {
  status: SolverStatus;
  statusDetail?: string;
  rounds: number;
  tickets: number[][];
  objective: number;
  bestBound?: number;
  isOptimal: boolean;
  verification?: VerificationReport;
  durationMs: number;
  constraintsAdded: number;
}

export interface GamePreset {
  id: string;
  name: string;
  description: string;
  from: number;
  to: number;
  ticketSize: number;
  resultSize: number;
  targets: TargetMap;
}
