/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

package oteldemo.recommendation;

import static org.assertj.core.api.Assertions.assertThat;

import dev.openfeature.sdk.Client;
import dev.openfeature.sdk.EvaluationContext;
import dev.openfeature.sdk.OpenFeatureAPI;
import dev.openfeature.sdk.providers.memory.Flag;
import dev.openfeature.sdk.providers.memory.InMemoryProvider;
import io.opentelemetry.api.baggage.Baggage;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.context.Scope;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class SegmentHookTests {

  @Test
  void mapsSegmentBaggageToFlatKeys() {
    Baggage baggage =
        Baggage.builder()
            .put("user.id", "shopper-3")
            .put("demo.user_context.country", "BR")
            .put("demo.shipping.delivery_method", "same_day")
            .put("session.id", "ignored")
            .build();

    Optional<EvaluationContext> context = SegmentHook.fromBaggage(baggage, Span.getInvalid());

    assertThat(context).isPresent();
    assertThat(context.get().getTargetingKey()).isEqualTo("shopper-3");
    assertThat(context.get().getValue("country").asString()).isEqualTo("BR");
    assertThat(context.get().getValue("delivery_method").asString()).isEqualTo("same_day");
    assertThat(context.get().keySet()).doesNotContain("session.id");
  }

  @Test
  void returnsNothingWithoutBaggage() {
    assertThat(SegmentHook.fromBaggage(Baggage.empty(), Span.getInvalid())).isEmpty();
  }

  @Test
  void letsFlagsTargetARegion() throws Exception {
    Flag<Boolean> flag =
        Flag.<Boolean>builder()
            .variant("on", true)
            .variant("off", false)
            .defaultVariant("off")
            .contextEvaluator(
                (f, ctx) -> ctx.getValue("region") != null && "eu".equals(ctx.getValue("region").asString()))
            .build();
    OpenFeatureAPI api = OpenFeatureAPI.getInstance();
    api.setProviderAndWait("segment-hook-test", new InMemoryProvider(Map.of("regionalFlag", flag)));
    Client client = api.getClient("segment-hook-test");
    client.addHooks(new SegmentHook());

    try (Scope ignored = Baggage.builder().put("demo.user_context.region", "eu").build().makeCurrent()) {
      assertThat(client.getBooleanValue("regionalFlag", false)).isTrue();
    }
    try (Scope ignored = Baggage.builder().put("demo.user_context.region", "apac").build().makeCurrent()) {
      assertThat(client.getBooleanValue("regionalFlag", false)).isFalse();
    }
  }
}
