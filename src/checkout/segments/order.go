// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

package segments

import (
	"strings"

	pb "github.com/open-telemetry/opentelemetry-demo/src/checkout/genproto/oteldemo"
)

var paymentMethodNames = map[pb.PaymentMethodType]string{
	pb.PaymentMethodType_PAYMENT_METHOD_TYPE_CARD:       "card",
	pb.PaymentMethodType_PAYMENT_METHOD_TYPE_APPLE_PAY:  "apple_pay",
	pb.PaymentMethodType_PAYMENT_METHOD_TYPE_GOOGLE_PAY: "google_pay",
	pb.PaymentMethodType_PAYMENT_METHOD_TYPE_PAYPAL:     "paypal",
	pb.PaymentMethodType_PAYMENT_METHOD_TYPE_CRYPTO:     "crypto",
	pb.PaymentMethodType_PAYMENT_METHOD_TYPE_BNPL:       "bnpl",
}

var deliveryMethodNames = map[pb.DeliveryMethod]string{
	pb.DeliveryMethod_DELIVERY_METHOD_STANDARD: "standard",
	pb.DeliveryMethod_DELIVERY_METHOD_EXPRESS:  "express",
	pb.DeliveryMethod_DELIVERY_METHOD_SAME_DAY: "same_day",
	pb.DeliveryMethod_DELIVERY_METHOD_PICKUP:   "pickup",
}

// NormalizePaymentMethod treats an unspecified payment method as card.
func NormalizePaymentMethod(t pb.PaymentMethodType) pb.PaymentMethodType {
	if _, ok := paymentMethodNames[t]; ok {
		return t
	}
	return pb.PaymentMethodType_PAYMENT_METHOD_TYPE_CARD
}

// NormalizeDeliveryMethod treats an unspecified delivery method as standard.
func NormalizeDeliveryMethod(d pb.DeliveryMethod) pb.DeliveryMethod {
	if _, ok := deliveryMethodNames[d]; ok {
		return d
	}
	return pb.DeliveryMethod_DELIVERY_METHOD_STANDARD
}

func PaymentMethodName(t pb.PaymentMethodType) string {
	return paymentMethodNames[NormalizePaymentMethod(t)]
}

func DeliveryMethodName(d pb.DeliveryMethod) string {
	return deliveryMethodNames[NormalizeDeliveryMethod(d)]
}

// CardNetwork derives the card network from the card number's issuer prefix.
func CardNetwork(number string) string {
	n := strings.ReplaceAll(strings.ReplaceAll(number, " ", ""), "-", "")
	switch {
	case n == "":
		return ""
	case strings.HasPrefix(n, "4"):
		return "visa"
	case strings.HasPrefix(n, "34"), strings.HasPrefix(n, "37"):
		return "amex"
	case strings.HasPrefix(n, "6011"), strings.HasPrefix(n, "65"):
		return "discover"
	case len(n) >= 2 && n[0] == '5' && n[1] >= '1' && n[1] <= '5':
		return "mastercard"
	case len(n) >= 4 && n[:4] >= "2221" && n[:4] <= "2720":
		return "mastercard"
	}
	return "unknown"
}
