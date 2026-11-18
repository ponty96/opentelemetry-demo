# Copyright The OpenTelemetry Authors
# SPDX-License-Identifier: Apache-2.0

from typing import Optional

from opentelemetry import baggage, trace
from openfeature.evaluation_context import EvaluationContext
from openfeature.hook import Hook

# Baggage key -> flat flagd evaluation context key (flagd's JsonLogic reads dots as nesting).
SEGMENT_KEYS = {
    "user.id": "user_id",
    "demo.user_context.tier": "user_tier",
    "demo.user_context.country": "country",
    "demo.user_context.region": "region",
    "demo.client.platform": "platform",
    "demo.payment.method": "payment_method",
    "demo.payment.card_type": "card_network",
    "demo.payment.wallet_provider": "wallet_provider",
    "demo.shipping.delivery_method": "delivery_method",
    "demo.shipping.carrier": "carrier",
}


def evaluation_attributes(values: dict) -> dict:
    return {SEGMENT_KEYS[key]: str(value) for key, value in values.items() if key in SEGMENT_KEYS and value}


class SegmentHook(Hook):
    """Copies shopper segment baggage into the flag evaluation context and onto the current span."""

    def before(self, hook_context, hints) -> Optional[EvaluationContext]:
        values = {k: v for k, v in baggage.get_all().items() if k in SEGMENT_KEYS}
        if not values:
            return None
        span = trace.get_current_span()
        for key, value in values.items():
            span.set_attribute(key, str(value))
        attributes = evaluation_attributes(values)
        return EvaluationContext(targeting_key=attributes.get("user_id"), attributes=attributes)
