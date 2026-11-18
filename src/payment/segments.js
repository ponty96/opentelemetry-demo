// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0
const { context, propagation, trace } = require('@opentelemetry/api');

// Baggage key -> flat flagd evaluation context key (flagd's JsonLogic reads dots as nesting).
const SEGMENT_KEYS = Object.freeze({
  'user.id': 'user_id',
  'demo.user_context.tier': 'user_tier',
  'demo.user_context.country': 'country',
  'demo.user_context.region': 'region',
  'demo.client.platform': 'platform',
  'demo.payment.method': 'payment_method',
  'demo.payment.card_type': 'card_network',
  'demo.payment.wallet_provider': 'wallet_provider',
  'demo.shipping.delivery_method': 'delivery_method',
  'demo.shipping.carrier': 'carrier',
});

function segmentsFromBaggage(baggage) {
  const attributes = {};
  const evaluationContext = {};
  if (!baggage) return { attributes, evaluationContext };

  for (const [key, flat] of Object.entries(SEGMENT_KEYS)) {
    const value = baggage.getEntry(key)?.value;
    if (!value) continue;
    attributes[key] = value;
    evaluationContext[flat] = value;
  }
  if (evaluationContext.user_id) {
    evaluationContext.targetingKey = evaluationContext.user_id;
  }
  return { attributes, evaluationContext };
}

const segmentHook = {
  before() {
    const { attributes, evaluationContext } = segmentsFromBaggage(
      propagation.getBaggage(context.active())
    );
    const span = trace.getActiveSpan();
    if (span && Object.keys(attributes).length > 0) {
      span.setAttributes(attributes);
    }
    return evaluationContext;
  },
};

module.exports = { SEGMENT_KEYS, segmentsFromBaggage, segmentHook };
