"""In-process, per-cafe event broker for live dashboard updates (SSE).

Each connected dashboard subscribes to its cafe and gets an asyncio queue;
``publish`` fans an event out to every queue for that cafe. This is a
single-process broker: with several API workers, an event only reaches the
dashboards connected to the worker that produced it (they still catch up via
their regular polling). Swap for Redis pub/sub if the backend is scaled out.
"""
import asyncio
import logging
from collections import defaultdict
from typing import Any

logger = logging.getLogger("cafepos")

_QUEUE_SIZE = 100
_subscribers: dict[str, set[asyncio.Queue]] = defaultdict(set)


def subscribe(cafe_id: str) -> asyncio.Queue:
    queue: asyncio.Queue = asyncio.Queue(maxsize=_QUEUE_SIZE)
    _subscribers[cafe_id].add(queue)
    return queue


def unsubscribe(cafe_id: str, queue: asyncio.Queue) -> None:
    _subscribers[cafe_id].discard(queue)
    if not _subscribers[cafe_id]:
        _subscribers.pop(cafe_id, None)


def publish(cafe_id: str, event: str, data: dict[str, Any]) -> None:
    """Fire-and-forget: never blocks or raises into the caller (a webhook or a
    settle must not fail because a dashboard is slow). A full queue drops the
    event for that subscriber only."""
    for queue in list(_subscribers.get(cafe_id, ())):
        try:
            queue.put_nowait({"event": event, "data": data})
        except asyncio.QueueFull:
            logger.warning("Dropping %s event for a slow subscriber (cafe %s)", event, cafe_id)
