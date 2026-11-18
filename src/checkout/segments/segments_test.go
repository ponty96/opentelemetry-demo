// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

package segments

import (
	"context"
	"fmt"
	"testing"

	flagd "github.com/open-feature/go-sdk-contrib/providers/flagd/pkg"
	"github.com/open-feature/go-sdk/openfeature"
	"go.opentelemetry.io/otel/baggage"
)

func withBaggage(t *testing.T, kv map[string]string) context.Context {
	t.Helper()
	members := []baggage.Member{}
	for k, v := range kv {
		m, err := baggage.NewMember(k, v)
		if err != nil {
			t.Fatal(err)
		}
		members = append(members, m)
	}
	bag, err := baggage.New(members...)
	if err != nil {
		t.Fatal(err)
	}
	return baggage.ContextWithBaggage(context.Background(), bag)
}

func TestFromBaggageUsesFlatKeys(t *testing.T) {
	ctx := withBaggage(t, map[string]string{
		"user.id":                       "shopper-1",
		"demo.payment.method":           "apple_pay",
		"demo.payment.wallet_provider":  "apple",
		"demo.user_context.country":     "DE",
		"demo.shipping.delivery_method": "express",
		"session.id":                    "not-a-segment",
	})
	attrs, evalAttrs := FromBaggage(ctx)

	want := map[string]any{
		"user_id":         "shopper-1",
		"payment_method":  "apple_pay",
		"wallet_provider": "apple",
		"country":         "DE",
		"delivery_method": "express",
	}
	if fmt.Sprint(evalAttrs) != fmt.Sprint(want) {
		t.Fatalf("evaluation context = %v, want %v", evalAttrs, want)
	}
	if len(attrs) != len(want) {
		t.Fatalf("got %d span attributes, want %d", len(attrs), len(want))
	}
}

func TestHookSetsTargetingKey(t *testing.T) {
	ctx := withBaggage(t, map[string]string{"user.id": "shopper-7", "demo.payment.card_type": "visa"})
	evalCtx, err := Hook{}.Before(ctx, openfeature.HookContext{}, openfeature.HookHints{})
	if err != nil {
		t.Fatal(err)
	}
	if evalCtx.TargetingKey() != "shopper-7" || evalCtx.Attribute("card_network") != "visa" {
		t.Fatalf("unexpected evaluation context: %+v", evalCtx)
	}

	empty, _ := Hook{}.Before(context.Background(), openfeature.HookContext{}, openfeature.HookHints{})
	if empty != nil {
		t.Fatalf("expected no context without baggage, got %+v", empty)
	}
}

func flagdClient(t *testing.T) *openfeature.Client {
	t.Helper()
	provider, err := flagd.NewProvider(flagd.WithInProcessResolver(), flagd.WithOfflineFilePath("testdata/segment-flags.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := openfeature.SetNamedProviderAndWait(t.Name(), provider); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { openfeature.Shutdown() })
	client := openfeature.NewClient(t.Name())
	client.AddHooks(Hook{})
	return client
}

func TestFlagdTargetsOnlyVisaShoppers(t *testing.T) {
	client := flagdClient(t)
	cases := map[string]bool{"visa": true, "mastercard": false, "amex": false}
	for network, want := range cases {
		ctx := withBaggage(t, map[string]string{"user.id": "shopper-1", "demo.payment.card_type": network})
		if got := client.Boolean(ctx, "visaOnlyFailure", false, openfeature.EvaluationContext{}); got != want {
			t.Errorf("%s: got %v, want %v", network, got, want)
		}
	}
	if client.Boolean(context.Background(), "visaOnlyFailure", false, openfeature.EvaluationContext{}) {
		t.Error("shopper without segment baggage should not be targeted")
	}
}

func TestFlagdFailsStableQuarterOfVisaShoppers(t *testing.T) {
	client := flagdClient(t)
	const shoppers = 2000
	failed := map[string]int{}
	for _, network := range []string{"visa", "mastercard"} {
		for i := 0; i < shoppers; i++ {
			ctx := withBaggage(t, map[string]string{
				"user.id":                fmt.Sprintf("shopper-%d", i),
				"demo.payment.card_type": network,
			})
			if client.Boolean(ctx, "visaQuarterFailure", false, openfeature.EvaluationContext{}) {
				failed[network]++
			}
		}
	}
	ratio := float64(failed["visa"]) / shoppers
	if ratio < 0.20 || ratio > 0.30 {
		t.Errorf("visa failure ratio = %.2f, want about 0.25", ratio)
	}
	if failed["mastercard"] != 0 {
		t.Errorf("mastercard failures = %d, want 0", failed["mastercard"])
	}

	ctx := withBaggage(t, map[string]string{"user.id": "shopper-3", "demo.payment.card_type": "visa"})
	first := client.Boolean(ctx, "visaQuarterFailure", false, openfeature.EvaluationContext{})
	for i := 0; i < 10; i++ {
		if client.Boolean(ctx, "visaQuarterFailure", false, openfeature.EvaluationContext{}) != first {
			t.Fatal("the same shopper should always land in the same bucket")
		}
	}
}
