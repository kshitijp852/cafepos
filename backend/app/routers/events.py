"""Server-Sent Events stream of live cafe updates (bill settled, UPI payment
received / needs review), so the floor view updates without waiting for its
next poll. Authenticated with the normal Bearer header (the frontend reads the
stream with fetch, not EventSource, so the token never goes in the URL)."""
import asyncio
import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.core.deps import get_current_user
from app.services import events

router = APIRouter(prefix="/events", tags=["events"])

_KEEPALIVE_SECONDS = 15


@router.get("/stream")
async def stream(request: Request, current_user: dict = Depends(get_current_user)):
    cafe_id = current_user["cafe_id"]
    queue = events.subscribe(cafe_id)

    async def gen():
        try:
            yield ": connected\n\n"
            while not await request.is_disconnected():
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=_KEEPALIVE_SECONDS)
                except asyncio.TimeoutError:
                    # Comment line keeps proxies from closing an idle stream.
                    yield ": keepalive\n\n"
                    continue
                yield f"event: {msg['event']}\ndata: {json.dumps(msg['data'])}\n\n"
        finally:
            events.unsubscribe(cafe_id, queue)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
