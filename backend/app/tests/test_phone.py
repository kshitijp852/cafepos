from app.services.phone import to_e164


def test_local_number_gets_default_country_code():
    assert to_e164("9876543210") == "+919876543210"
    assert to_e164("98765 43210") == "+919876543210"
    assert to_e164("098765-43210"[1:]) == "+919876543210"


def test_already_international_preserved():
    assert to_e164("+91 98765 43210") == "+919876543210"
    assert to_e164("0091 9876543210") == "+919876543210"
    assert to_e164("+1 (415) 555-0132") == "+14155550132"


def test_custom_default_country_code():
    assert to_e164("5551234567", default_country_code="1") == "+15551234567"


def test_blank_or_too_short_returns_none():
    assert to_e164("") is None
    assert to_e164(None) is None
    assert to_e164("123") is None
