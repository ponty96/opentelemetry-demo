// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading.Tasks;
using cart.featureflags;
using OpenFeature;
using OpenFeature.Model;
using OpenFeature.Providers.Memory;
using OpenTelemetry;
using Xunit;

namespace cart.tests;

public class SegmentHookTests
{
    [Fact]
    public void FromBaggage_MapsSegmentsToFlatKeys()
    {
        var baggage = Baggage.Create(new Dictionary<string, string>
        {
            ["user.id"] = "shopper-5",
            ["demo.client.platform"] = "ios",
            ["demo.payment.card_type"] = "amex",
            ["session.id"] = "not-a-segment",
        });
        using var activity = new Activity("test").Start();

        var context = SegmentHook.FromBaggage(baggage, activity);

        Assert.Equal("shopper-5", context.TargetingKey);
        Assert.Equal("ios", context.GetValue("platform").AsString);
        Assert.Equal("amex", context.GetValue("card_network").AsString);
        Assert.False(context.ContainsKey("session.id"));
        Assert.Equal("ios", activity.GetTagItem("demo.client.platform"));
    }

    [Fact]
    public void FromBaggage_EmptyWithoutBaggage()
    {
        var context = SegmentHook.FromBaggage(default, null);
        Assert.Equal(0, context.Count);
        Assert.Null(context.TargetingKey);
    }

    [Fact]
    public async Task Hook_LetsFlagsTargetIosShoppers()
    {
        var flags = new Dictionary<string, Flag>
        {
            ["cartFailure"] = new Flag<double>(
                new Dictionary<string, double> { ["off"] = 0, ["half"] = 0.5 },
                "off",
                ctx => ctx.ContainsKey("platform") && ctx.GetValue("platform").AsString == "ios" ? "half" : "off"),
        };
        await Api.Instance.SetProviderAsync("segment-hook-test", new InMemoryProvider(flags));
        var client = Api.Instance.GetClient("segment-hook-test");
        client.AddHooks(new SegmentHook());

        Baggage.Current = Baggage.Create(new Dictionary<string, string> { ["demo.client.platform"] = "ios" });
        Assert.Equal(0.5, await client.GetDoubleValueAsync("cartFailure", 0));

        Baggage.Current = Baggage.Create(new Dictionary<string, string> { ["demo.client.platform"] = "web" });
        Assert.Equal(0, await client.GetDoubleValueAsync("cartFailure", 0));

        Baggage.Current = default;
    }
}
