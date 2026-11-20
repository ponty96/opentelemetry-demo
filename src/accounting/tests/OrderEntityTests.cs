// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0
using Accounting;
using Oteldemo;
using Xunit;

namespace Accounting.Tests;

public class OrderEntityTests
{
    [Fact]
    public void MapsSegmentFieldsToSnakeCaseColumns()
    {
        var order = new OrderResult
        {
            OrderId = "o-1",
            PaymentMethod = PaymentMethodType.ApplePay,
            DeliveryMethod = DeliveryMethod.SameDay,
            Carrier = "local_courier",
            ShippingAddress = new Address { Country = "DE" },
        };

        var entity = order.ToOrderEntity();

        Assert.Equal("o-1", entity.Id);
        Assert.Equal("apple_pay", entity.PaymentMethod);
        Assert.Equal("same_day", entity.DeliveryMethod);
        Assert.Equal("local_courier", entity.Carrier);
        Assert.Equal("DE", entity.Country);
        Assert.Null(entity.CardNetwork);
    }

    [Fact]
    public void LegacyOrderDefaultsToCardAndStandard()
    {
        var entity = new OrderResult { OrderId = "o-2", CardNetwork = "visa" }.ToOrderEntity();

        Assert.Equal("card", entity.PaymentMethod);
        Assert.Equal("standard", entity.DeliveryMethod);
        Assert.Equal("visa", entity.CardNetwork);
        Assert.Null(entity.Carrier);
        Assert.Null(entity.Country);
    }

    [Theory]
    [InlineData(PaymentMethodType.GooglePay, "google_pay")]
    [InlineData(PaymentMethodType.Bnpl, "bnpl")]
    [InlineData(PaymentMethodType.Crypto, "crypto")]
    public void PaymentMethodNames(PaymentMethodType type, string expected)
    {
        Assert.Equal(expected, new OrderResult { PaymentMethod = type }.ToOrderEntity().PaymentMethod);
    }
}
