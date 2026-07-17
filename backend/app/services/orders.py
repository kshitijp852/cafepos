"""Unified order lifecycle shared by dine-in and counter/quick-sale orders.

The same Order document backs both modes: a dine-in order carries a real
``table_id`` (UUID); a counter sale leaves ``table_id`` null. The lifecycle and
its allowed transitions are identical for both.

    pending → preparing → ready → completed
       └──────────┴──────────┴──────────────→ cancelled

``active`` is treated as an alias of ``pending`` for backward compatibility with
orders created before the lifecycle was formalised.
"""
from app.models.common import OrderStatus

_TERMINAL = {OrderStatus.completed.value, OrderStatus.cancelled.value}

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    OrderStatus.pending.value: {OrderStatus.preparing.value, OrderStatus.cancelled.value},
    OrderStatus.active.value: {OrderStatus.preparing.value, OrderStatus.cancelled.value},
    OrderStatus.preparing.value: {OrderStatus.ready.value, OrderStatus.cancelled.value},
    OrderStatus.ready.value: {OrderStatus.completed.value, OrderStatus.cancelled.value},
    OrderStatus.completed.value: set(),
    OrderStatus.cancelled.value: set(),
}


def can_transition(current: str, target: str) -> bool:
    return target in ALLOWED_TRANSITIONS.get(current, set())


def is_terminal(status: str) -> bool:
    return status in _TERMINAL
