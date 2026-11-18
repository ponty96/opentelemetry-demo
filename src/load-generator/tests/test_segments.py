# Copyright The OpenTelemetry Authors
# SPDX-License-Identifier: Apache-2.0
"""Run from src/load-generator: python3 -m unittest discover -s tests"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from segments import SEGMENT_KEYS, SegmentHook, evaluation_attributes  # noqa: E402


class EvaluationAttributesTest(unittest.TestCase):
    def test_maps_allowlisted_keys_to_flat_names(self):
        self.assertEqual(
            evaluation_attributes({"user.id": "p-1", "demo.payment.card_type": "visa", "session.id": "x"}),
            {"user_id": "p-1", "card_network": "visa"},
        )

    def test_every_segment_key_has_a_flat_name_without_dots(self):
        for flat in SEGMENT_KEYS.values():
            self.assertNotIn(".", flat)


class SegmentHookTest(unittest.TestCase):
    def test_flag_targets_android_shoppers(self):
        from openfeature import api
        from openfeature.flag_evaluation import FlagResolutionDetails
        from openfeature.provider.in_memory_provider import InMemoryFlag, InMemoryProvider
        from opentelemetry import baggage, context

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

    def test_no_context_without_segments(self):
        self.assertIsNone(SegmentHook().before(None, None))


if __name__ == "__main__":
    unittest.main()
