import time
from typing import List, Tuple, Dict, Any, Callable, Optional
from src.core import generate_combinations
from src.solver_cp_sat import solve_subproblem
from src.verifier import verify_tickets

def optimize_tickets(
    number_from: int,
    number_to: int,
    ticket_size: int,
    result_size: int,
    targets: Dict[int, int],
    all_results: List[Tuple[int, ...]],
    time_limit: float = 60.0,
    callback: Optional[Callable[[int, int, int], None]] = None
) -> Tuple[str, List[Tuple[int, ...]], Dict[str, Any]]:
    """
    Cutting-plane constraint generation optimizer.
    """
    start_time = time.time()
    pool = list(range(number_from, number_to + 1))
    all_tickets = generate_combinations(pool, ticket_size)
    
    # Initial seeds: sample results uniformly
    seed_count = min(15, len(all_results))
    step = max(1, len(all_results) // seed_count)
    constrained_results = [all_results[i * step] for i in range(seed_count)]
    
    round_num = 0
    best_tickets: List[Tuple[int, ...]] = []
    best_bound = 0
    final_stats: Dict[str, Any] = {}
    proved_optimal = False
    
    while True:
        round_num += 1
        elapsed = time.time() - start_time
        remaining = max(1.0, time_limit - elapsed)
        if elapsed >= time_limit:
            break
            
        round_time = min(remaining, 15.0)
        status, current_tickets, obj, bound = solve_subproblem(
            all_tickets, constrained_results, targets, round_time, best_bound
        )
        
        if status == "INFEASIBLE":
            return "INFEASIBLE", [], {"rounds": round_num, "elapsed": time.time() - start_time}
            
        if not current_tickets:
            break
            
        best_tickets = current_tickets
        best_bound = max(best_bound, bound)
        
        # Verify across 100% of all results
        is_valid, violations, stats = verify_tickets(all_results, best_tickets, targets)
        final_stats = stats
        
        if callback:
            callback(round_num, len(best_tickets), len(violations))
            
        if is_valid:
            proved_optimal = (status == "OPTIMAL" and len(best_tickets) == bound)
            break
            
        # Add new violating results to constraints (up to 30 per round)
        for v in violations[:30]:
            if v not in constrained_results:
                constrained_results.append(v)
                
    elapsed_total = time.time() - start_time
    status_label = "PROVED OPTIMAL" if proved_optimal else ("BEST FOUND" if best_tickets else "TIMEOUT")
    
    return status_label, best_tickets, {
        "rounds": round_num,
        "elapsed": elapsed_total,
        "stats": final_stats,
        "constraints_count": len(constrained_results)
    }
