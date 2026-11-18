// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

use open_feature::EvaluationContext;
use opentelemetry::baggage::BaggageExt;
use opentelemetry::trace::TraceContextExt;
use opentelemetry::{Context, KeyValue};

// Baggage key -> flat flagd evaluation context key (flagd's JsonLogic reads dots as nesting).
pub const SEGMENT_KEYS: [(&str, &str); 10] = [
    ("user.id", "user_id"),
    ("demo.user_context.tier", "user_tier"),
    ("demo.user_context.country", "country"),
    ("demo.user_context.region", "region"),
    ("demo.client.platform", "platform"),
    ("demo.payment.method", "payment_method"),
    ("demo.payment.card_type", "card_network"),
    ("demo.payment.wallet_provider", "wallet_provider"),
    ("demo.shipping.delivery_method", "delivery_method"),
    ("demo.shipping.carrier", "carrier"),
];

/// Builds the flag evaluation context from the shopper segment baggage in `cx`
/// and records the segments on its active span.
pub fn evaluation_context(cx: &Context) -> EvaluationContext {
    let baggage = cx.baggage();
    let mut eval = EvaluationContext::default();
    let mut attributes = Vec::new();
    for (key, flat) in SEGMENT_KEYS {
        if let Some(value) = baggage.get(key) {
            let value = value.as_str().to_string();
            if value.is_empty() {
                continue;
            }
            if key == "user.id" {
                eval = eval.with_targeting_key(value.clone());
            }
            attributes.push(KeyValue::new(key, value.clone()));
            eval = eval.with_custom_field(flat, value);
        }
    }
    if !attributes.is_empty() {
        cx.span().set_attributes(attributes);
    }
    eval
}

#[cfg(test)]
mod tests {
    use super::*;
    use open_feature::EvaluationContextFieldValue;
    use opentelemetry::baggage::BaggageExt;

    #[test]
    fn evaluation_context_uses_flat_keys_and_targeting_key() {
        let cx = Context::new().with_baggage(vec![
            KeyValue::new("user.id", "shopper-9"),
            KeyValue::new("demo.user_context.country", "NG"),
            KeyValue::new("demo.shipping.carrier", "dhl"),
            KeyValue::new("session.id", "ignored"),
        ]);
        let eval = evaluation_context(&cx);
        assert_eq!(eval.targeting_key.as_deref(), Some("shopper-9"));
        assert_eq!(
            eval.custom_fields.get("country"),
            Some(&EvaluationContextFieldValue::String("NG".into()))
        );
        assert_eq!(
            eval.custom_fields.get("carrier"),
            Some(&EvaluationContextFieldValue::String("dhl".into()))
        );
        assert!(!eval.custom_fields.contains_key("session.id"));
    }

    #[test]
    fn evaluation_context_is_empty_without_baggage() {
        let eval = evaluation_context(&Context::new());
        assert!(eval.targeting_key.is_none());
        assert!(eval.custom_fields.is_empty());
    }
}
