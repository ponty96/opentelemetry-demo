/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
package oteldemo;

import dev.openfeature.sdk.EvaluationContext;
import dev.openfeature.sdk.Hook;
import dev.openfeature.sdk.HookContext;
import dev.openfeature.sdk.MutableContext;
import io.opentelemetry.api.baggage.Baggage;
import io.opentelemetry.api.trace.Span;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Copies shopper segment baggage into every flag evaluation context under flat keys (flagd's
 * JsonLogic reads dots as nesting), uses the shopper ID as targeting key, and records the segments
 * on the current span.
 */
public class SegmentHook implements Hook<Object> {

  public static final Map<String, String> SEGMENT_KEYS = new LinkedHashMap<>();

  static {
    SEGMENT_KEYS.put("user.id", "user_id");
    SEGMENT_KEYS.put("demo.user_context.tier", "user_tier");
    SEGMENT_KEYS.put("demo.user_context.country", "country");
    SEGMENT_KEYS.put("demo.user_context.region", "region");
    SEGMENT_KEYS.put("demo.client.platform", "platform");
    SEGMENT_KEYS.put("demo.payment.method", "payment_method");
    SEGMENT_KEYS.put("demo.payment.card_type", "card_network");
    SEGMENT_KEYS.put("demo.payment.wallet_provider", "wallet_provider");
    SEGMENT_KEYS.put("demo.shipping.delivery_method", "delivery_method");
    SEGMENT_KEYS.put("demo.shipping.carrier", "carrier");
  }

  public static Optional<EvaluationContext> fromBaggage(Baggage baggage, Span span) {
    MutableContext context = new MutableContext();
    boolean found = false;
    for (Map.Entry<String, String> entry : SEGMENT_KEYS.entrySet()) {
      String value = baggage.getEntryValue(entry.getKey());
      if (value == null || value.isEmpty()) {
        continue;
      }
      found = true;
      context.add(entry.getValue(), value);
      span.setAttribute(entry.getKey(), value);
      if ("user.id".equals(entry.getKey())) {
        context.setTargetingKey(value);
      }
    }
    return found ? Optional.of(context) : Optional.empty();
  }

  @Override
  public Optional<EvaluationContext> before(HookContext<Object> ctx, Map<String, Object> hints) {
    return fromBaggage(Baggage.current(), Span.current());
  }
}
