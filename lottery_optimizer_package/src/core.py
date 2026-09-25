from itertools import combinations
from typing import List, Tuple

def validate_game(number_from: int, number_to: int, ticket_size: int, result_size: int) -> int:
    if not (0 <= number_from <= number_to <= 40):
        raise ValueError("Range must satisfy 0 <= Number From <= Number To <= 40")
    pool_size = number_to - number_from + 1
    if not (1 <= ticket_size <= pool_size):
        raise ValueError(f"Ticket size must be between 1 and {pool_size}")
    if not (1 <= result_size <= pool_size):
        raise ValueError(f"Result size must be between 1 and {pool_size}")
    return pool_size

def generate_combinations(pool: List[int], k: int) -> List[Tuple[int, ...]]:
    return list(combinations(pool, k))

def count_exact_matches(c1: Tuple[int, ...], c2: Tuple[int, ...]) -> int:
    # Set intersection size
    s1 = set(c1)
    return sum(1 for x in c2 if x in s1)
