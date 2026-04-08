from __future__ import annotations

from langgraph.graph import END, StateGraph

from graph.state import SentinelState
from nodes.architect import architect_node
from nodes.courier_execute import courier_execute_node
from nodes.courier_decision import courier_decision_node
from nodes.decision import decision_node
from nodes.healer import healer_node
from nodes.run_tests import run_tests_node


def route_after_decision(state: SentinelState) -> str:
    decision = state.get("decision")
    if decision == "has_failures":
        return "healer"
    if decision == "all_pass":
        return "done"
    raise ValueError("state.decision must be 'all_pass' or 'has_failures'")


def build_phase1_graph():
    builder = StateGraph(SentinelState)

    builder.add_node("architect", architect_node)
    builder.add_node("run_tests", run_tests_node)
    builder.add_node("decision", decision_node)
    builder.add_node("healer", healer_node)
    builder.add_node("courier_decision", courier_decision_node)
    builder.add_node("courier_execute", courier_execute_node)

    builder.set_entry_point("architect")
    builder.add_edge("architect", "run_tests")
    builder.add_edge("run_tests", "decision")
    builder.add_conditional_edges(
        "decision",
        route_after_decision,
        {
            "healer": "healer",
            "done": END,
        },
    )
    builder.add_edge("healer", "courier_decision")
    builder.add_edge("courier_decision", "courier_execute")
    builder.add_edge("courier_execute", END)

    return builder.compile()
