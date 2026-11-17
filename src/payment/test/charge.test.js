// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0
const { test, before, describe } = require('node:test');
const assert = require('node:assert/strict');
const { context, propagation } = require('@opentelemetry/api');
const { AsyncLocalStorageContextManager } = require('@opentelemetry/context-async-hooks');
const { OpenFeature, InMemoryProvider } = require('@openfeature/server-sdk');

const { segmentsFromBaggage } = require('../segments');
const { charge } = require('../charge');

const VISA = '4432801561520454';
const MASTERCARD = '5555555555554444';
const nextYear = new Date().getFullYear() + 1;

const card = number => ({
  creditCardNumber: number,
  creditCardCvv: 123,
  creditCardExpirationYear: nextYear,
  creditCardExpirationMonth: 1,
});
const amount = { units: 10, nanos: 0, currencyCode: 'USD' };

function withBaggage(entries, fn) {
  const baggage = propagation.createBaggage(
    Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, { value: v }]))
  );
  return context.with(propagation.setBaggage(context.active(), baggage), fn);
}

before(async () => {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  await OpenFeature.setProviderAndWait(
    new InMemoryProvider({
      paymentFailure: {
        disabled: false,
        variants: { off: 0, all: 1 },
        defaultVariant: 'off',
        contextEvaluator: ctx => (ctx.card_network === 'visa' ? 'all' : 'off'),
      },
      emitRawPii: { disabled: false, variants: { off: false }, defaultVariant: 'off' },
    })
  );
});

describe('segmentsFromBaggage', () => {
  test('maps segment baggage to flat evaluation context keys', () => {
    const baggage = propagation.createBaggage({
      'user.id': { value: 'shopper-42' },
      'demo.payment.method': { value: 'card' },
      'demo.payment.card_type': { value: 'visa' },
      'demo.user_context.country': { value: 'NG' },
      'demo.shipping.delivery_method': { value: 'express' },
      'session.id': { value: 'ignored' },
    });
    const { evaluationContext, attributes } = segmentsFromBaggage(baggage);
    assert.deepEqual(evaluationContext, {
      user_id: 'shopper-42',
      targetingKey: 'shopper-42',
      payment_method: 'card',
      card_network: 'visa',
      country: 'NG',
      delivery_method: 'express',
    });
    assert.equal(attributes['demo.payment.card_type'], 'visa');
    assert.equal(attributes['session.id'], undefined);
  });

  test('returns empty context without baggage', () => {
    assert.deepEqual(segmentsFromBaggage(undefined).evaluationContext, {});
  });
});

describe('paymentFailure targeted by segment', () => {
  test('fails Visa shoppers when the flag targets card_network = visa', async () => {
    await assert.rejects(
      withBaggage({ 'demo.payment.card_type': 'visa' }, () =>
        charge({ amount, creditCard: card(VISA) })
      ),
      /Payment request failed/
    );
  });

  test('leaves Mastercard shoppers unaffected', async () => {
    const res = await withBaggage({ 'demo.payment.card_type': 'mastercard' }, () =>
      charge({ amount, creditCard: card(MASTERCARD) })
    );
    assert.ok(res.transactionId);
  });
});
