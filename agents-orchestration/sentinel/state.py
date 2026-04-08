"""
Backward-compatible import path.

Historically, code imported `SentinelState` from `sentinel.state`. The canonical
definition now lives in `graph.state`.
"""

from graph.state import SentinelState as SentinelState

__all__ = ["SentinelState"]
