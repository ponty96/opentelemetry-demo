// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

package segments

import (
	"testing"

	"google.golang.org/protobuf/proto"

	pb "github.com/open-telemetry/opentelemetry-demo/src/checkout/genproto/oteldemo"
)

func TestCardNetwork(t *testing.T) {
	cases := map[string]string{
		"4432-8015-6152-0454": "visa",
		"5555555555554444":    "mastercard",
		"2221000000000009":    "mastercard",
		"378282246310005":     "amex",
		"6011111111111117":    "discover",
		"":                    "",
		"9999":                "unknown",
	}
	for number, want := range cases {
		if got := CardNetwork(number); got != want {
			t.Errorf("CardNetwork(%q) = %q, want %q", number, got, want)
		}
	}
}

func TestUnspecifiedMethodsHaveDefaults(t *testing.T) {
	if PaymentMethodName(pb.PaymentMethodType_PAYMENT_METHOD_TYPE_UNSPECIFIED) != "card" {
		t.Error("unspecified payment method should be card")
	}
	if DeliveryMethodName(pb.DeliveryMethod_DELIVERY_METHOD_UNSPECIFIED) != "standard" {
		t.Error("unspecified delivery method should be standard")
	}
	for typ, name := range map[pb.PaymentMethodType]string{
		pb.PaymentMethodType_PAYMENT_METHOD_TYPE_APPLE_PAY:  "apple_pay",
		pb.PaymentMethodType_PAYMENT_METHOD_TYPE_GOOGLE_PAY: "google_pay",
		pb.PaymentMethodType_PAYMENT_METHOD_TYPE_PAYPAL:     "paypal",
		pb.PaymentMethodType_PAYMENT_METHOD_TYPE_CRYPTO:     "crypto",
		pb.PaymentMethodType_PAYMENT_METHOD_TYPE_BNPL:       "bnpl",
	} {
		if got := PaymentMethodName(typ); got != name {
			t.Errorf("PaymentMethodName(%v) = %q, want %q", typ, got, name)
		}
	}
	if DeliveryMethodName(pb.DeliveryMethod_DELIVERY_METHOD_SAME_DAY) != "same_day" {
		t.Error("same day name mismatch")
	}
}

// A request from a client built before this change has no payment or delivery
// method on the wire; it must decode to the defaults (card, standard).
func TestRequestsWithoutNewFieldsKeepTodaysBehaviour(t *testing.T) {
	legacy := &pb.PlaceOrderRequest{
		UserId:     "shopper-1",
		CreditCard: &pb.CreditCardInfo{CreditCardNumber: "4432-8015-6152-0454"},
	}
	wire, err := proto.Marshal(legacy)
	if err != nil {
		t.Fatal(err)
	}
	var decoded pb.PlaceOrderRequest
	if err := proto.Unmarshal(wire, &decoded); err != nil {
		t.Fatal(err)
	}
	if NormalizePaymentMethod(decoded.GetPaymentMethod().GetType()) != pb.PaymentMethodType_PAYMENT_METHOD_TYPE_CARD {
		t.Error("legacy request should be treated as a card payment")
	}
	if NormalizeDeliveryMethod(decoded.GetDeliveryMethod()) != pb.DeliveryMethod_DELIVERY_METHOD_STANDARD {
		t.Error("legacy request should be treated as standard delivery")
	}
}

func TestNewFieldsRoundTrip(t *testing.T) {
	asset := "ETH"
	in := &pb.OrderResult{
		OrderId:        "o-1",
		PaymentMethod:  pb.PaymentMethodType_PAYMENT_METHOD_TYPE_CRYPTO,
		DeliveryMethod: pb.DeliveryMethod_DELIVERY_METHOD_EXPRESS,
		Carrier:        "dhl",
		CardNetwork:    "",
	}
	req := &pb.ChargeRequest{PaymentMethod: &pb.PaymentMethod{Type: pb.PaymentMethodType_PAYMENT_METHOD_TYPE_CRYPTO, CryptoAsset: &asset}}

	for _, msg := range []proto.Message{in, req} {
		wire, err := proto.Marshal(msg)
		if err != nil {
			t.Fatal(err)
		}
		out := msg.ProtoReflect().New().Interface()
		if err := proto.Unmarshal(wire, out); err != nil {
			t.Fatal(err)
		}
		if !proto.Equal(msg, out) {
			t.Errorf("round trip changed the message: %v -> %v", msg, out)
		}
	}
}
