"""Pluggable UPI payment gateways.

A gateway does three things for us:

1. ``create_dynamic_qr`` — turn (reference, amount) into a QR payload for one
   bill, so the payment that comes back names the bill it was for.
2. ``verify_signature`` — prove a webhook really came from the gateway (HMAC
   over the raw body with the merchant's secret), so nobody can POST a fake
   "paid" and close a table.
3. ``parse_notification`` — map the gateway's webhook JSON onto
   ``PaymentNotification``.

Only the ``mock`` gateway ships today. Adding PhonePe / Paytm means writing one
subclass per provider against their docs (their QR API call, signature header
and payload shape) and registering it in ``GATEWAYS``; nothing else changes.
"""
import hashlib
import hmac
import json
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Mapping, Optional
from urllib.parse import quote, urlencode


class InvalidNotification(ValueError):
    """The webhook body couldn't be parsed into a payment notification."""


@dataclass(frozen=True)
class GatewayConfig:
    merchant_id: str
    vpa: str
    payee_name: str
    secret: str


@dataclass(frozen=True)
class PaymentNotification:
    transaction_id: str
    amount: float
    # Normalised: "SUCCESS" for a completed payment; anything else is ignored.
    status: str
    # Our order reference when the payment came from a dynamic QR; None for a
    # static counter QR / soundbox payment.
    reference: Optional[str]
    paid_at: Optional[datetime]


class PaymentGateway(ABC):
    name: str

    @abstractmethod
    async def create_dynamic_qr(self, config: GatewayConfig, reference: str, amount: float) -> str:
        """Return the string to encode in the bill's QR code."""

    @abstractmethod
    def verify_signature(self, raw_body: bytes, headers: Mapping[str, str], secret: str) -> bool:
        ...

    @abstractmethod
    def parse_notification(self, raw_body: bytes) -> PaymentNotification:
        ...


def hmac_sha256_hex(secret: str, raw_body: bytes) -> str:
    return hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()


def upi_intent(vpa: str, payee_name: str, amount: float, reference: str) -> str:
    """Standard UPI deep link (NPCI ``upi://pay``); any UPI app can scan it."""
    params = {
        "pa": vpa,
        "pn": payee_name,
        "am": f"{amount:.2f}",
        "cu": "INR",
        "tr": reference,
        "tn": f"Bill {reference}",
    }
    return "upi://pay?" + urlencode(params, quote_via=quote)


class MockGateway(PaymentGateway):
    """Local stand-in for a real gateway.

    QR: a plain UPI intent for the configured VPA with our reference in ``tr``.
    Webhook: the JSON shape below, signed as hex HMAC-SHA256 of the raw body in
    the ``X-Mock-Signature`` header::

        {"merchantId": "MID_1", "transactionId": "TXN_1", "amount": 450.00,
         "status": "SUCCESS", "timestamp": "2026-10-08T15:30:00Z",
         "reference": "T4-8F2A1C"}   # reference omitted for static-QR payments
    """

    name = "mock"
    signature_header = "x-mock-signature"

    async def create_dynamic_qr(self, config: GatewayConfig, reference: str, amount: float) -> str:
        return upi_intent(config.vpa, config.payee_name, amount, reference)

    def verify_signature(self, raw_body: bytes, headers: Mapping[str, str], secret: str) -> bool:
        given = headers.get(self.signature_header, "")
        if not secret or not given:
            return False
        return hmac.compare_digest(given, hmac_sha256_hex(secret, raw_body))

    def parse_notification(self, raw_body: bytes) -> PaymentNotification:
        try:
            body = json.loads(raw_body)
            paid_at = body.get("timestamp")
            return PaymentNotification(
                transaction_id=str(body["transactionId"]),
                amount=float(body["amount"]),
                status=str(body.get("status", "")).upper(),
                reference=body.get("reference") or None,
                paid_at=datetime.fromisoformat(paid_at.replace("Z", "+00:00")) if paid_at else None,
            )
        except (ValueError, KeyError, TypeError, AttributeError) as exc:
            raise InvalidNotification(str(exc)) from exc

    def sign(self, raw_body: bytes, secret: str) -> dict[str, str]:
        """Headers for a webhook body (used by the simulate endpoint and tests)."""
        return {self.signature_header: hmac_sha256_hex(secret, raw_body)}


GATEWAYS: dict[str, PaymentGateway] = {g.name: g for g in (MockGateway(),)}


def get_gateway(name: str) -> Optional[PaymentGateway]:
    return GATEWAYS.get(name)
