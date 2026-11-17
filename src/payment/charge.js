// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0
const { context, propagation, trace, metrics, SpanStatusCode } = require('@opentelemetry/api');
const { ATTR_ERROR_TYPE } = require('@opentelemetry/semantic-conventions');
const cardValidator = require('simple-card-validator');
const { v4: uuidv4 } = require('uuid');

const { OpenFeature } = require('@openfeature/server-sdk');
const { FlagdProvider } = require('@openfeature/flagd-provider');
const { segmentHook, segmentsFromBaggage } = require('./segments');
if (process.env.NODE_ENV !== 'test') {
  OpenFeature.setProvider(new FlagdProvider());
}
OpenFeature.addHooks(segmentHook);

const logger = require('./logger');
const tracer = trace.getTracer('payment');
const meter = metrics.getMeter('payment');
const transactionsCounter = meter.createCounter('demo.payment.transactions', {
  unit: '{transaction}',
});

const PAYMENT_METHODS = ['card', 'apple_pay', 'google_pay', 'paypal', 'crypto', 'bnpl'];
const WALLET_PROVIDERS = { apple_pay: 'apple', google_pay: 'google', paypal: 'paypal', crypto: 'coinbase', bnpl: 'klarna' };
const ACCEPTED_CARD_NETWORKS = ['visa', 'mastercard', 'amex', 'discover'];
const CRYPTO_ASSETS = ['BTC', 'ETH', 'USDC'];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function paymentMethodName(paymentMethod) {
  const type = paymentMethod?.type;
  if (typeof type === 'number') return PAYMENT_METHODS[type - 1] || 'card';
  if (typeof type === 'string' && type !== 'PAYMENT_METHOD_TYPE_UNSPECIFIED') {
    const name = type.replace('PAYMENT_METHOD_TYPE_', '').toLowerCase();
    if (PAYMENT_METHODS.includes(name)) return name;
  }
  return 'card';
}

function chargeCard(creditCard, span, emitRawPii) {
  if (!creditCard) {
    throw new Error('Credit card info is missing.');
  }
  const {
    creditCardNumber: number,
    creditCardCvv: cvv,
    creditCardExpirationYear: year,
    creditCardExpirationMonth: month
  } = creditCard;
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const lastFourDigits = number.substr(-4);

  const { card_type: cardType, valid } = cardValidator(number).getCardDetails();

  span.setAttributes({
    'demo.payment.card_type': cardType,
    'demo.payment.card_valid': valid,
    ...(emitRawPii && {
      'demo.payment.card_number': number,
      'demo.payment.card_cvv': cvv
    })
  });

  if (!valid) {
    throw new Error('Credit card info is invalid.');
  }

  if (!ACCEPTED_CARD_NETWORKS.includes(cardType)) {
    throw new Error(`Sorry, we cannot process ${cardType} credit cards.`);
  }

  if ((currentYear * 12 + currentMonth) > (year * 12 + month)) {
    throw new Error(`The credit card (ending ${lastFourDigits}) expired on ${month}/${year}.`);
  }

  return { cardType, lastFourDigits };
}

async function chargeAlternative(method, paymentMethod) {
  switch (method) {
    case 'apple_pay':
    case 'google_pay':
    case 'paypal':
      if (!paymentMethod?.walletToken?.startsWith('tok_')) {
        throw new Error(`The ${method} wallet token is missing or invalid.`);
      }
      return {};
    case 'crypto': {
      const asset = (paymentMethod?.cryptoAsset || '').toUpperCase();
      if (!CRYPTO_ASSETS.includes(asset)) {
        throw new Error(`Unsupported crypto asset "${asset}".`);
      }
      await sleep(200 + Math.random() * 300);
      return { cryptoAsset: asset };
    }
    case 'bnpl':
      await sleep(100 + Math.random() * 200);
      return {};
    default:
      throw new Error(`Unsupported payment method ${method}.`);
  }
}

module.exports.paymentMethodName = paymentMethodName;

module.exports.charge = async request => {
  const span = tracer.startSpan('charge');

  try {
    const baggage = propagation.getBaggage(context.active());
    const syntheticRequest = baggage?.getEntry('synthetic_request')?.value === 'true';

    if (syntheticRequest) {
      span.setAttribute('user_agent.synthetic.type', 'test');
    }
    span.setAttributes(segmentsFromBaggage(baggage).attributes);

    const method = paymentMethodName(request.paymentMethod);
    const walletProvider = WALLET_PROVIDERS[method];
    span.setAttributes({
      'demo.payment.method': method,
      ...(walletProvider && { 'demo.payment.wallet_provider': walletProvider }),
    });

    const client = OpenFeature.getClient();
    const numberVariant = await client.getNumberValue('paymentFailure', 0);
    const emitRawPii = await client.getBooleanValue('emitRawPii', false);

    if (numberVariant > 0 && Math.random() < numberVariant) {
      throw new Error('Payment request failed. Invalid token.');
    }

    const transactionId = uuidv4();
    const details = method === 'card'
      ? chargeCard(request.creditCard, span, emitRawPii)
      : await chargeAlternative(method, request.paymentMethod);

    // Do not charge synthetic requests.
    if (syntheticRequest) {
      span.setAttribute('demo.payment.charged', false);
    } else {
      span.setAttribute('demo.payment.charged', true);
    }

    const enduserId = baggage?.getEntry('enduser.id')?.value;
    if (enduserId) {
      span.setAttribute('enduser.id', enduserId);
    }

    const { units, nanos, currencyCode } = request.amount;
    logger.info({ transactionId, method, ...details, amount: { units, nanos, currencyCode } }, 'Transaction complete.');
    transactionsCounter.add(1, { 'demo.payment.currency': currencyCode, 'demo.payment.method': method });

    return { transactionId };
  } catch (err) {
    span.recordException(err);
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    span.setAttribute(ATTR_ERROR_TYPE, err.name || 'Error');

    throw err;
  } finally {
    span.end();
  }
};
