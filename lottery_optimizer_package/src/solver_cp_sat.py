from typing import List, Tuple, Dict
from ortools.sat.python import cp_model
from src.core import count_exact_matches

def solve_subproblem(
    all_tickets: List[Tuple[int, ...]],
    constrained_results: List[Tuple[int, ...]],
    targets: Dict[int, int],
    time_limit_seconds: float = 30.0,
    best_bound: int = 0
) -> Tuple[str, List[Tuple[int, ...]], int, int]:
    """
    Solves a set covering instance with CP-SAT.
    """
    model = cp_model.CpModel()
    
    # Decision variables: x[i] = 1 if all_tickets[i] is selected, 0 otherwise
    x = [model.NewBoolVar(f"ticket_{i}") for i in range(len(all_tickets))]
    
    # Objective: Minimize total tickets selected
    model.Minimize(sum(x))
    
    # Pre-build lookup map for performance
    # For each constrained result and target k, sum(x[t] for t with match==k) >= target
    for res in constrained_results:
        matches_by_k: Dict[int, List[int]] = {k: [] for k in targets.keys()}
        for t_idx, ticket in enumerate(all_tickets):
            m = count_exact_matches(ticket, res)
            if m in matches_by_k:
                matches_by_k[m].append(t_idx)
                
        for k, min_req in targets.items():
            candidate_vars = [x[i] for i in matches_by_k[k]]
            if len(candidate_vars) < min_req:
                return "INFEASIBLE", [], 0, 0
            model.Add(sum(candidate_vars) >= min_req)
            
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(time_limit_seconds)
    solver.parameters.num_workers = 4
    
    status = solver.Solve(model)
    
    if status == cp_model.OPTIMAL:
        selected = [all_tickets[i] for i, var in enumerate(x) if solver.Value(var) == 1]
        obj = int(solver.ObjectiveValue())
        bound = int(solver.BestObjectiveBound())
        return "OPTIMAL", selected, obj, bound
    elif status == cp_model.FEASIBLE:
        selected = [all_tickets[i] for i, var in enumerate(x) if solver.Value(var) == 1]
        obj = int(solver.ObjectiveValue())
        bound = int(solver.BestObjectiveBound())
        return "FEASIBLE", selected, obj, bound
    elif status == cp_model.INFEASIBLE:
        return "INFEASIBLE", [], 0, 0
    else:
        return "TIMEOUT", [], 0, 0
