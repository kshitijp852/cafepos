"""Pincode -> city/state lookup, proxied through the backend.

The RapidAPI key stays server-side (a browser-side call would publish it in the
bundle). Results are memoized per pincode — the postal map is effectively static
and the upstream plan is quota-limited.
"""
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.core.config import get_settings
from app.core.deps import get_current_user

router = APIRouter(prefix="/pincode", tags=["pincode"])
logger = logging.getLogger("cafepos.pincode")
settings = get_settings()

_CACHE: dict[str, dict] = {}


def _pick(offices: list[dict]) -> dict:
    """Prefer the delivery/head office — its district is the usable city name."""
    ranked = sorted(
        offices,
        key=lambda o: (
            o.get("delivery", "").lower() != "delivery",
            o.get("office_type", "") != "H.O",
        ),
    )
    return ranked[0]


@router.get("/{pincode}")
async def lookup_pincode(pincode: str, current_user: dict = Depends(get_current_user)):
    """Resolve a 6-digit Indian pincode to {city, district, state}."""
    if not (pincode.isdigit() and len(pincode) == 6):
        raise HTTPException(status_code=400, detail="Enter a 6-digit pincode.")
    if pincode in _CACHE:
        return _CACHE[pincode]
    if not settings.rapidapi_key:
        raise HTTPException(status_code=503, detail="Pincode lookup is not configured.")

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.post(
                f"https://{settings.pincode_api_host}/v1/postalcodes/india",
                json={"search": pincode},
                headers={
                    "Content-Type": "application/json",
                    "x-rapidapi-host": settings.pincode_api_host,
                    "x-rapidapi-key": settings.rapidapi_key,
                },
            )
            resp.raise_for_status()
            offices = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Pincode lookup failed for %s: %s", pincode, exc)
        raise HTTPException(status_code=502, detail="Pincode lookup is unavailable right now.")

    # The upstream is a fuzzy search, so drop anything that isn't this pincode.
    offices = [o for o in offices if str(o.get("pin")) == pincode] if isinstance(offices, list) else []
    if not offices:
        raise HTTPException(status_code=404, detail="No matching pincode found.")

    best = _pick(offices)
    result = {
        "pincode": pincode,
        "city": (best.get("district") or "").strip(),
        "district": (best.get("district") or "").strip(),
        "state": (best.get("state") or "").strip(),
        # Localities under this pincode, for the user to refine the address with.
        "areas": sorted({(o.get("office") or "").strip() for o in offices if o.get("office")}),
    }
    _CACHE[pincode] = result
    return result
