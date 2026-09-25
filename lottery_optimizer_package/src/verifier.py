from typing import List, Tuple, Dict, Any
from src.core import generate_combinations, count_exact_matches

def generate_all_results(number_from: int, number_to: int, result_size: int) -> List[Tuple[int, ...]]:
    pool = list(range(number_from, number_to + 1))
    return generate_combinations(pool, result_size)

def verify_tickets(
    all_results: List[Tuple[int, ...]],
    tickets: List[Tuple[int, ...]],
    targets: Dict[int, int]
) -> Tuple[bool, List[Tuple[int, ...]], Dict[int, Dict[str, Any]]]:
    """
    Exhaustively verifies tickets against all possible results.
    Returns:
      - is_valid: True if 100% of results satisfy targets
      - violating_results: list of results that failed any target
      - stats: detailed per-k stats (min, max, avg, worst_res, best_res)
    """
    if not all_results or not tickets:
        return False, [], {}
        
    num_results = len(all_results)
    violating_results = []
    
    max_k = max(max(targets.keys(), default=0), 6)
    min_counts = {k: float('inf') for k in range(max_k + 1)}
    max_counts = {k: -1 for k in range(max_k + 1)}
    sum_counts = {k: 0 for k in range(max_k + 1)}
    worst_result = {k: None for k in range(max_k + 1)}
    best_result = {k: None for k in range(max_k + 1)}
    
    target_items = list(targets.items())
    
    for res in all_results:
        counts = {k: 0 for k in range(max_k + 1)}
        for ticket in tickets:
            m = count_exact_matches(ticket, res)
            if m <= max_k:
                counts[m] += 1
                
        is_violation = False
        for k, min_req in target_items:
            if counts[k] < min_req:
                is_violation = True
                
        if is_violation:
            violating_results.append(res)
            
        for k in range(max_k + 1):
            c = counts[k]
            sum_counts[k] += c
            if c < min_counts[k]:
                min_counts[k] = c
                worst_result[k] = res
            if c > max_counts[k]:
                max_counts[k] = c
                best_result[k] = res
                
    stats = {}
    for k in range(max_k + 1):
        stats[k] = {
            "min": int(min_counts[k]) if min_counts[k] != float('inf') else 0,
            "max": int(max_counts[k]) if max_counts[k] != -1 else 0,
            "avg": round(sum_counts[k] / num_results, 3) if num_results > 0 else 0.0,
            "worst_result": worst_result[k],
            "best_result": best_result[k],
        }
        
    is_valid = len(violating_results) == 0
    return is_valid, violating_results, stats
