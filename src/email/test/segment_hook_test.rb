# Copyright The OpenTelemetry Authors
# SPDX-License-Identifier: Apache-2.0

require "minitest/autorun"
require_relative "../segment_hook"

class SegmentHookTest < Minitest::Test
  def test_maps_segment_baggage_to_flat_keys
    context = SegmentHook.from_baggage(
      "user.id" => "shopper-11",
      "demo.payment.method" => "paypal",
      "demo.payment.wallet_provider" => "paypal",
      "session.id" => "ignored"
    )

    assert_equal "shopper-11", context.targeting_key
    assert_equal "paypal", context.field("payment_method")
    assert_equal "paypal", context.field("wallet_provider")
    assert_nil context.field("session.id")
  end

  def test_returns_nil_without_segments
    assert_nil SegmentHook.from_baggage({})
  end

  def test_hook_reads_current_baggage
    ctx = OpenTelemetry::Baggage.set_value("demo.client.platform", "android")
    OpenTelemetry::Context.with_current(ctx) do
      context = SegmentHook.new.before(hook_context: nil, hints: nil)
      assert_equal "android", context.field("platform")
    end
  end
end
