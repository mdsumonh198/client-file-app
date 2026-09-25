import os
import sys

# Ensure module path resolution works in all hosting environments
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

import streamlit as st
import pandas as pd
from src.core import validate_game
from src.optimizer import optimize_tickets
from src.verifier import verify_tickets, generate_all_results

st.set_page_config(page_title="Universal Lottery Optimizer", layout="wide", page_icon="🎯")
st.title("🎯 Universal Lottery & Combination Optimizer")
st.markdown("Guaranteed 100% exact-match coverage verification across all possible results.")

with st.sidebar:
    st.header("⚙️ Game Parameters")
    n_from = st.number_input("Number From (min 0)", min_value=0, max_value=40, value=1)
    n_to = st.number_input("Number To (max 40)", min_value=0, max_value=40, value=15)
    t_size = st.number_input("Ticket Size", min_value=1, max_value=40, value=6)
    r_size = st.number_input("Result Size", min_value=1, max_value=40, value=6)
    time_limit = st.slider("Time Limit (seconds)", min_value=10, max_value=300, value=60)
    
    st.header("🎯 Minimum Exact-Match Targets")
    st.caption("E.g., Exact 3 >= 1, Exact 2 >= 3")
    max_k = min(t_size, r_size)
    targets = {}
    for k in range(max_k, 0, -1):
        default_val = 1 if k == 3 else (3 if k == 2 and max_k >= 3 else 0)
        val = st.number_input(f"Exact {k} matches >=", min_value=0, value=default_val, key=f"target_{k}")
        if val > 0:
            targets[k] = val

try:
    pool_size = validate_game(n_from, n_to, t_size, r_size)
    all_results = generate_all_results(n_from, n_to, r_size)
    st.info(f"📊 Pool: {pool_size} numbers ({n_from}..{n_to}) | Total possible results: {len(all_results):,}")
except Exception as e:
    st.error(f"Configuration error: {e}")
    st.stop()

if st.button("🚀 Start Optimization", type="primary", use_container_width=True):
    if not targets:
        st.warning("Please specify at least one target (e.g. Exact 3 >= 1).")
        st.stop()
        
    progress_bar = st.progress(0)
    status_text = st.empty()
    
    def on_progress(round_num, tickets_count, violations_count):
        status_text.text(f"Round {round_num}: {tickets_count} tickets generated | {violations_count} violating results remaining")
        progress_bar.progress(min(1.0, round_num / 15.0))
        
    status, tickets, metadata = optimize_tickets(
        n_from, n_to, t_size, r_size, targets, all_results, time_limit, on_progress
    )
    
    progress_bar.progress(1.0)
    status_text.empty()
    
    # Status Alert
    if status == "PROVED OPTIMAL":
        st.success(f"🏆 Status: **{status}** ({len(tickets)} tickets in {metadata['rounds']} rounds, {metadata['elapsed']:.2f}s)")
    elif status == "BEST FOUND":
        st.info(f"✅ Status: **{status}** ({len(tickets)} tickets in {metadata['rounds']} rounds, {metadata['elapsed']:.2f}s)")
    else:
        st.warning(f"⚠️ Status: **{status}**")
        
    if tickets:
        tab1, tab2 = st.tabs(["📋 Generated Tickets", "🔍 Exhaustive Verification Report"])
        
        with tab1:
            st.subheader(f"Optimal Ticket Set ({len(tickets)} tickets)")
            df_tickets = pd.DataFrame(tickets, columns=[f"N{i+1}" for i in range(t_size)])
            st.dataframe(df_tickets, use_container_width=True)
            
            csv = df_tickets.to_csv(index=False).encode('utf-8')
            st.download_button("📥 Download Tickets CSV", data=csv, file_name="tickets.csv", mime="text/csv")
            
        with tab2:
            st.subheader("100% Result Verification (No Sampling)")
            stats = metadata.get("stats", {})
            rows = []
            for k in range(max_k + 1):
                stat = stats.get(k, {})
                target_req = targets.get(k, "-")
                min_val = stat.get("min", 0)
                is_passed = (min_val >= target_req) if target_req != "-" else True
                rows.append({
                    "Exact Match": f"Exact {k}",
                    "Min (Worst Case)": min_val,
                    "Max (Best Case)": stat.get("max", 0),
                    "Average": stat.get("avg", 0.0),
                    "Target Required": f">= {target_req}" if target_req != "-" else "-",
                    "Status": "✅ PASS" if is_passed else "❌ FAIL",
                    "Worst Result Example": str(stat.get("worst_result", "-")),
                    "Best Result Example": str(stat.get("best_result", "-"))
                })
            df_stats = pd.DataFrame(rows)
            st.dataframe(df_stats, use_container_width=True)
            
            csv_stats = df_stats.to_csv(index=False).encode('utf-8')
            st.download_button("📥 Download Verification CSV", data=csv_stats, file_name="verification.csv", mime="text/csv")
