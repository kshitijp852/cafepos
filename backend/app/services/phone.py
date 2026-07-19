"""Best-effort E.164 phone normalization for customer numbers captured at
settlement, so stored numbers are ready for WhatsApp/SMS messaging."""
import re


def to_e164(raw: str | None, default_country_code: str = "91") -> str | None:
    """Normalize a phone number to E.164 (e.g. '+919876543210').

    Rules:
    - '+' prefix or leading '00' -> treated as already international.
    - a bare local number (no country code) -> the cafe's default CC is prepended.
    Returns the normalized string, or None when there's nothing usable
    (blank/too short) — never raises, so it can't block a settlement.
    """
    if not raw:
        return None
    s = re.sub(r"[^\d+]", "", raw.strip())
    if not s:
        return None

    if s.startswith("+"):
        digits = re.sub(r"\D", "", s[1:])
    elif s.startswith("00"):
        digits = s[2:]
    else:
        # Local number with no country code: prepend the default CC.
        digits = s if len(s) > 10 else f"{default_country_code}{s}"

    if not (8 <= len(digits) <= 15):
        return None
    return f"+{digits}"
