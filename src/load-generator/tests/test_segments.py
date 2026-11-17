# Copyright The OpenTelemetry Authors
# SPDX-License-Identifier: Apache-2.0
"""Run from src/load-generator: python3 -m unittest discover -s tests"""

import collections
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from generate_personas import DISTRIBUTIONS, generate, luhn_complete  # noqa: E402
from segments import SEGMENT_KEYS, checkout_request, evaluation_attributes, persona_baggage  # noqa: E402


def luhn_valid(number: str) -> bool:
    digits = number.replace("-", "")
    return luhn_complete(digits[:-1]) == digits


class PersonaGeneratorTest(unittest.TestCase):
    personas = generate(count=2000, seed=7)

    def share(self, attribute, value, population=None):
        population = population if population is not None else self.personas
        return sum(1 for p in population if p.get(attribute) == value) / len(population)

    def test_is_reproducible(self):
        self.assertEqual(generate(count=20, seed=1), generate(count=20, seed=1))
        self.assertNotEqual(generate(count=20, seed=1), generate(count=20, seed=2))

    def test_follows_payment_and_delivery_distributions(self):
        for attribute in ("paymentMethod", "deliveryMethod", "tier", "platform"):
            weights = DISTRIBUTIONS[attribute]
            total = sum(weights.values())
            for value, weight in weights.items():
                self.assertAlmostEqual(self.share(attribute, value), weight / total, delta=0.03, msg=f"{attribute}={value}")

    def test_card_network_split_among_card_payers(self):
        card_payers = [p for p in self.personas if p["paymentMethod"] == "card"]
        self.assertAlmostEqual(self.share("cardNetwork", "visa", card_payers), 0.55, delta=0.04)
        self.assertAlmostEqual(self.share("cardNetwork", "mastercard", card_payers), 0.30, delta=0.04)
        self.assertAlmostEqual(self.share("cardNetwork", "amex", card_payers), 0.15, delta=0.04)

    def test_cards_are_luhn_valid_and_match_network(self):
        prefixes = {"visa": ("4",), "mastercard": ("51", "52", "53", "54", "55"), "amex": ("37",)}
        for persona in self.personas:
            if persona["paymentMethod"] != "card":
                self.assertNotIn("creditCard", persona)
                continue
            number = persona["creditCard"]["creditCardNumber"]
            self.assertTrue(luhn_valid(number), number)
            self.assertTrue(number.startswith(prefixes[persona["cardNetwork"]]), number)

    def test_ids_are_unique(self):
        self.assertEqual(len({p["id"] for p in self.personas}), len(self.personas))

    def test_committed_people_json_matches_generator(self):
        committed = json.loads(Path(__file__).resolve().parents[1].joinpath("people.json").read_text())
        self.assertEqual(committed, generate())


class SegmentBaggageTest(unittest.TestCase):
    card_persona = {
        "id": "p-1", "email": "a@example.com", "tier": "plus", "platform": "ios",
        "address": {"streetAddress": "x", "zipCode": "1", "city": "Berlin", "state": "BE", "country": "DE"},
        "userCurrency": "EUR", "paymentMethod": "card", "cardNetwork": "visa", "deliveryMethod": "express",
        "creditCard": {"creditCardNumber": "4432-8015-6152-0454", "creditCardCvv": 672,
                       "creditCardExpirationMonth": 1, "creditCardExpirationYear": 2039},
    }

    def test_card_persona_baggage(self):
        self.assertEqual(persona_baggage(self.card_persona), {
            "user.id": "p-1",
            "demo.user_context.tier": "plus",
            "demo.user_context.country": "DE",
            "demo.user_context.region": "eu",
            "demo.client.platform": "ios",
            "demo.payment.method": "card",
            "demo.payment.card_type": "visa",
            "demo.shipping.delivery_method": "express",
            "demo.shipping.carrier": "dhl",
        })

    def test_wallet_persona_checkout_request(self):
        persona = {**self.card_persona, "paymentMethod": "apple_pay"}
        persona.pop("creditCard")
        request = checkout_request(persona, "cart-1")
        self.assertEqual(request["paymentMethod"]["type"], 2)
        self.assertTrue(request["paymentMethod"]["walletToken"].startswith("tok_"))
        self.assertEqual(request["deliveryMethod"], 2)
        self.assertNotIn("creditCard", request)
        self.assertEqual(persona_baggage(persona)["demo.payment.wallet_provider"], "apple")
        self.assertNotIn("demo.payment.card_type", persona_baggage(persona))

    def test_every_generated_persona_maps_to_known_segment_keys(self):
        for persona in generate(count=200):
            values = persona_baggage(persona)
            self.assertTrue(set(values) <= set(SEGMENT_KEYS))
            attributes = evaluation_attributes(values)
            self.assertEqual(attributes["user_id"], persona["id"])
            checkout_request(persona, "cart")


class SegmentHookTest(unittest.TestCase):
    def test_flag_targets_android_shoppers(self):
        from openfeature import api
        from openfeature.flag_evaluation import FlagResolutionDetails
        from openfeature.provider.in_memory_provider import InMemoryFlag, InMemoryProvider
        from opentelemetry import baggage, context
        from segments import SegmentHook

        flag = InMemoryFlag(
            "off",
            {"on": 10, "off": 0},
            context_evaluator=lambda flag, ctx: FlagResolutionDetails(
                value=flag.variants["on" if ctx.attributes.get("platform") == "android" else "off"]
            ),
        )
        api.set_provider(InMemoryProvider({"loadGeneratorFloodHomepage": flag}), domain="segment-test")
        client = api.get_client("segment-test")
        client.add_hooks([SegmentHook()])

        for platform, expected in (("android", 10), ("web", 0)):
            token = context.attach(baggage.set_baggage("demo.client.platform", platform))
            try:
                self.assertEqual(client.get_integer_value("loadGeneratorFloodHomepage", 0), expected)
            finally:
                context.detach(token)


if __name__ == "__main__":
    unittest.main()
