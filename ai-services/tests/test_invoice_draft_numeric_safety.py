"""
Phase 4.12 regression test.

_f() (invoice_draft.py) coerces arbitrary client input into a float used
directly in financial totals (subtotal, vat, net_total). Non-numeric
strings ("abc") correctly raised ValueError and fell back to the default -
but float("nan") and float("inf") succeed without raising, meaning a
client-submitted hours/rate value of "nan" would propagate NaN through
the entire totals block. validate_draft()'s numeric comparisons
(<=, <, >) would then silently fail to catch this, since every NaN
comparison evaluates to False in Python - a corrupted invoice could pass
validation and reach approval/rendering.
"""
import math
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from invoice_draft import _f, validate_draft


class TestNumericCoercionSafety:
    def test_nan_string_rejected(self):
        assert _f("nan") == 0.0

    def test_infinity_string_rejected(self):
        assert _f("inf") == 0.0
        assert _f("infinity") == 0.0

    def test_negative_infinity_string_rejected(self):
        assert _f("-inf") == 0.0

    def test_float_nan_rejected(self):
        assert _f(float("nan")) == 0.0

    def test_float_infinity_rejected(self):
        assert _f(float("inf")) == 0.0

    def test_custom_default_preserved_for_non_finite(self):
        assert _f("nan", 99.0) == 99.0

    # --- confirm normal behavior is unaffected ---

    def test_normal_numeric_string_unaffected(self):
        assert _f("5.5") == 5.5

    def test_normal_float_unaffected(self):
        assert _f(5.5) == 5.5

    def test_none_unaffected(self):
        assert _f(None) == 0.0

    def test_non_numeric_string_unaffected(self):
        assert _f("abc") == 0.0

    def test_zero_unaffected(self):
        assert _f(0) == 0.0

    def test_negative_number_unaffected(self):
        # _f itself does not reject negative values - that is
        # validate_draft's job (e.g. net_total < 0), not the coercion
        # layer's. Only non-finite values are rejected here.
        assert _f(-5.5) == -5.5


class TestValidateDraftCatchesNonFiniteTotals:
    """
    Confirms the fix's actual effect on the validation path a malicious
    client would be trying to defeat: with the fix, a NaN-inducing input
    never reaches validate_draft() as NaN in the first place, because
    recompute() builds totals via _f()-coerced row values.
    """

    def test_nan_hours_no_longer_produces_nan_subtotal(self):
        # Simulates what recompute() does: hours * rate, coerced through _f.
        hours = _f("nan")
        rate = _f("50")
        amount = round(hours * rate + 0.0, 2)
        assert math.isfinite(amount), "amount must be finite after coercion, not NaN"
        assert amount == 0.0
