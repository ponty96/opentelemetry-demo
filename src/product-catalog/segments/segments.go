// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

package segments

import (
	"context"

	"github.com/open-feature/go-sdk/openfeature"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/baggage"
	"go.opentelemetry.io/otel/trace"
)

// Keys maps shopper segment baggage keys to flat flagd evaluation context keys
// (flagd's JsonLogic reads dots as nesting).
var Keys = map[string]string{
	"user.id":                       "user_id",
	"demo.user_context.tier":        "user_tier",
	"demo.user_context.country":     "country",
	"demo.user_context.region":      "region",
	"demo.client.platform":          "platform",
	"demo.payment.method":           "payment_method",
	"demo.payment.card_type":        "card_network",
	"demo.payment.wallet_provider":  "wallet_provider",
	"demo.shipping.delivery_method": "delivery_method",
	"demo.shipping.carrier":         "carrier",
}

// FromBaggage returns the segment span attributes and flat evaluation context
// attributes carried in the context's baggage.
func FromBaggage(ctx context.Context) ([]attribute.KeyValue, map[string]any) {
	bag := baggage.FromContext(ctx)
	attrs := []attribute.KeyValue{}
	evalAttrs := map[string]any{}
	for key, flat := range Keys {
		value := bag.Member(key).Value()
		if value == "" {
			continue
		}
		attrs = append(attrs, attribute.String(key, value))
		evalAttrs[flat] = value
	}
	return attrs, evalAttrs
}

// Hook copies shopper segment baggage into every flag evaluation context, uses
// the shopper ID as targeting key, and records the segments on the active span.
type Hook struct {
	openfeature.UnimplementedHook
}

func (Hook) Before(ctx context.Context, _ openfeature.HookContext, _ openfeature.HookHints) (*openfeature.EvaluationContext, error) {
	attrs, evalAttrs := FromBaggage(ctx)
	if len(evalAttrs) == 0 {
		return nil, nil
	}
	trace.SpanFromContext(ctx).SetAttributes(attrs...)
	targetingKey, _ := evalAttrs["user_id"].(string)
	evalCtx := openfeature.NewEvaluationContext(targetingKey, evalAttrs)
	return &evalCtx, nil
}
