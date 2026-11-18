// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using OpenFeature;
using OpenFeature.Model;
using OpenTelemetry;

namespace cart.featureflags;

/// <summary>
/// Copies shopper segment baggage into every flag evaluation context under flat keys
/// (flagd's JsonLogic reads dots as nesting), uses the shopper ID as targeting key,
/// and records the segments on the current activity.
/// </summary>
public class SegmentHook : Hook
{
    public static readonly IReadOnlyDictionary<string, string> SegmentKeys = new Dictionary<string, string>
    {
        ["user.id"] = "user_id",
        ["demo.user_context.tier"] = "user_tier",
        ["demo.user_context.country"] = "country",
        ["demo.user_context.region"] = "region",
        ["demo.client.platform"] = "platform",
        ["demo.payment.method"] = "payment_method",
        ["demo.payment.card_type"] = "card_network",
        ["demo.payment.wallet_provider"] = "wallet_provider",
        ["demo.shipping.delivery_method"] = "delivery_method",
        ["demo.shipping.carrier"] = "carrier",
    };

    public static EvaluationContext FromBaggage(Baggage baggage, Activity? activity)
    {
        var builder = EvaluationContext.Builder();
        foreach (var (key, flat) in SegmentKeys)
        {
            var value = baggage.GetBaggage(key);
            if (string.IsNullOrEmpty(value))
            {
                continue;
            }

            builder.Set(flat, value);
            activity?.SetTag(key, value);
            if (key == "user.id")
            {
                builder.SetTargetingKey(value);
            }
        }

        return builder.Build();
    }

    public override ValueTask<EvaluationContext> BeforeAsync<T>(HookContext<T> context,
        IReadOnlyDictionary<string, object>? hints = null, CancellationToken cancellationToken = default)
    {
        return new ValueTask<EvaluationContext>(FromBaggage(Baggage.Current, Activity.Current));
    }
}
