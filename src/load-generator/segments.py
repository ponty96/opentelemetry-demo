# Copyright The OpenTelemetry Authors
# SPDX-License-Identifier: Apache-2.0

from typing import Optional

from opentelemetry import baggage, trace

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

REGIONS = {"US": "na", "CA": "na", "GB": "eu", "DE": "eu", "NG": "africa", "BR": "latam", "JP": "apac", "IN": "apac"}

WALLET_PROVIDERS = {"apple_pay": "apple", "google_pay": "google", "paypal": "paypal", "crypto": "coinbase", "bnpl": "klarna"}

PAYMENT_METHOD_TYPES = {"card": 1, "apple_pay": 2, "google_pay": 3, "paypal": 4, "crypto": 5, "bnpl": 6}

DELIVERY_METHOD_TYPES = {"standard": 1, "express": 2, "same_day": 3, "pickup": 4}


def carrier(delivery_method: str, country: str) -> str:
    if delivery_method in ("same_day", "pickup"):
        return "local_courier"
    if delivery_method == "express":
        return "fedex" if country in ("US", "CA") else "dhl"
    if country == "US":
        return "usps"
    if country == "CA":
        return "ups"
    return "fedex" if country in ("BR", "JP", "IN") else "dhl"


def persona_baggage(persona: dict) -> dict:
    method = persona["paymentMethod"]
    country = persona["address"]["country"]
    entries = {
        "user.id": persona["id"],
        "demo.user_context.tier": persona["tier"],
        "demo.user_context.country": country,
        "demo.user_context.region": REGIONS.get(country, "other"),
        "demo.client.platform": persona["platform"],
        "demo.payment.method": method,
        "demo.payment.card_type": persona.get("cardNetwork", "") if method == "card" else "",
        "demo.payment.wallet_provider": WALLET_PROVIDERS.get(method, ""),
        "demo.shipping.delivery_method": persona["deliveryMethod"],
        "demo.shipping.carrier": carrier(persona["deliveryMethod"], country),
    }
    return {key: value for key, value in entries.items() if value}


def checkout_request(persona: dict, cart_user_id: str) -> dict:
    method = persona["paymentMethod"]
    payment_method = {"type": PAYMENT_METHOD_TYPES[method]}
    if WALLET_PROVIDERS.get(method) in ("apple", "google", "paypal"):
        payment_method["walletToken"] = f"tok_{persona['id'].replace('-', '')}"
    if method == "crypto":
        payment_method["cryptoAsset"] = persona["cryptoAsset"]
    request = {
        "userId": cart_user_id,
        "email": persona["email"],
        "address": persona["address"],
        "userCurrency": persona["userCurrency"],
        "paymentMethod": payment_method,
        "deliveryMethod": DELIVERY_METHOD_TYPES[persona["deliveryMethod"]],
    }
    if method == "card":
        request["creditCard"] = persona["creditCard"]
    return request


def evaluation_attributes(values: dict) -> dict:
    return {SEGMENT_KEYS[key]: str(value) for key, value in values.items() if key in SEGMENT_KEYS and value}


try:
    from openfeature.evaluation_context import EvaluationContext
    from openfeature.hook import Hook

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

except ImportError:  # pragma: no cover - persona generation runs without the OpenFeature SDK
    SegmentHook = None
