export interface GameConfig {
  numberFrom: number;
  numberTo: number;
  ticketSize: number;
  resultSize: number;
}

export type TargetMap = Record<number, number>; // exact k -> minimum count

export interface SolverProgressInfo {
  round: number;
  maxRounds: number;
  currentTickets: number;
  currentTicketList?: number[][];
  violationsCount: number;
  deficit?: number;
  activeConstraints: number;
  totalCombinations: number;
  stepName: string;
  status: string;
  engine?: string;
}

export type SolverStatus =
  | 'PROVED OPTIMAL'
  | 'BEST FOUND'
  | 'INFEASIBLE'
  | 'TIMEOUT'
  | 'RUNNING'
  | 'READY';

export interface ExactMatchStat {
  k: number;
  label?: string;
  isGuaranteeRow?: boolean;
  min: number;
  max: number;
  avg: number;
  variance: number;
  stdDev: number;
  worstResult: number[];
  bestResult: number[];
  requiredTarget?: number;
  passed?: boolean;
}

export interface VerificationReport {
  totalTickets: number;
  totalResultsChecked: number;
  totalPassDraws: number;
  totalFailDraws: number;
  passRatePct: number;
  primaryGuaranteeStat?: ExactMatchStat;
  guaranteeStats?: ExactMatchStat[];
  stats: Record<number, ExactMatchStat>;
  allTargetsPass: boolean;
  worstCaseOverallResult?: number[];
  bestCaseOverallResult?: number[];
  balanceScore: number;
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
  solverEngine?: string;
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
