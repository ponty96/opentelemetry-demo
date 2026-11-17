# Copyright The OpenTelemetry Authors
# SPDX-License-Identifier: Apache-2.0

require "open_feature/sdk"
require "opentelemetry/sdk"

# Copies shopper segment baggage into every flag evaluation context under flat keys
# (flagd's JsonLogic reads dots as nesting), uses the shopper ID as targeting key,
# and records the segments on the current span.
class SegmentHook
  include OpenFeature::SDK::Hooks::Hook

  SEGMENT_KEYS = {
    "user.id" => "user_id",
    "demo.user_context.tier" => "user_tier",
    "demo.user_context.country" => "country",
    "demo.user_context.region" => "region",
    "demo.client.platform" => "platform",
    "demo.payment.method" => "payment_method",
    "demo.payment.card_type" => "card_network",
    "demo.payment.wallet_provider" => "wallet_provider",
    "demo.shipping.delivery_method" => "delivery_method",
    "demo.shipping.carrier" => "carrier"
  }.freeze

  def self.from_baggage(baggage_values, span = OpenTelemetry::Trace.current_span)
    fields = {}
    SEGMENT_KEYS.each do |key, flat|
      value = baggage_values[key]
      next if value.nil? || value.empty?

      fields[flat] = value
      fields[OpenFeature::SDK::EvaluationContext::TARGETING_KEY] = value if key == "user.id"
      span.set_attribute(key, value)
    end
    return nil if fields.empty?

    OpenFeature::SDK::EvaluationContext.new(**fields.transform_keys(&:to_sym))
  end

  def before(hook_context:, hints:)
    self.class.from_baggage(OpenTelemetry::Baggage.values)
  end
end
