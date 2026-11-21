// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { getElementByField } from '../../utils/Cypress';
import { CypressFields } from '../../utils/enums/CypressFields';

const APPLE_PAY = 2;
const EXPRESS = 2;

const quote = (deliveryMethod: string, country: string) =>
  cy
    .request({
      url: '/api/shipping',
      qs: {
        itemList: JSON.stringify([{ productId: '0PUK6V6EV0', quantity: 1 }]),
        currencyCode: 'USD',
        address: JSON.stringify({
          streetAddress: '1600 Amphitheatre Parkway',
          city: 'Mountain View',
          state: 'CA',
          country,
          zipCode: '94043',
        }),
        deliveryMethod,
      },
    })
    .its('body');

describe('Checkout with shopper segments', () => {
  beforeEach(() => {
    cy.intercept('POST', '/api/cart*').as('addToCart');
    cy.intercept('POST', '/api/checkout*').as('placeOrder');
    cy.visit('/');
  });

  it('places an Apple Pay order with express delivery to Germany', () => {
    getElementByField(CypressFields.ProductCard).first().click();
    getElementByField(CypressFields.ProductAddToCart).click();
    cy.wait('@addToCart');
    cy.location('href').should('match', /\/cart$/);

    getElementByField(CypressFields.CheckoutCountry).select('DE');
    getElementByField(CypressFields.CheckoutDeliveryMethod).select('express');
    getElementByField(CypressFields.CheckoutPaymentMethod).select('apple_pay');
    getElementByField(CypressFields.CheckoutCarrier).should('contain', 'DHL');
    getElementByField(CypressFields.CheckoutCardNetwork).should('not.exist');

    getElementByField(CypressFields.CheckoutPlaceOrder).click();

    cy.wait('@placeOrder').then(({ request, response }) => {
      expect(request.body.paymentMethod.type).to.eq(APPLE_PAY);
      expect(request.body.paymentMethod.walletToken).to.match(/^tok_/);
      expect(request.body.deliveryMethod).to.eq(EXPRESS);
      expect(request.body.address.country).to.eq('DE');
      expect(request.body.creditCard).to.be.undefined;

      const baggage = request.headers['baggage'] as string;
      expect(baggage).to.contain('demo.payment.method=apple_pay');
      expect(baggage).to.contain('demo.payment.wallet_provider=apple');
      expect(baggage).to.contain('demo.shipping.delivery_method=express');
      expect(baggage).to.contain('demo.user_context.country=DE');
      expect(baggage).to.contain('demo.user_context.region=eu');
      expect(baggage).to.contain('demo.client.platform=web');

      expect(response?.statusCode).to.eq(200);
      expect(response?.body.carrier).to.eq('dhl');
    });

    cy.location('href').should('match', /\/checkout/);
    getElementByField(CypressFields.CheckoutOrderSegments)
      .should('contain', 'Apple Pay')
      .and('contain', 'Express')
      .and('contain', 'DHL');
  });

  it('sends the card network of a card payment as baggage', () => {
    getElementByField(CypressFields.ProductCard).first().click();
    getElementByField(CypressFields.ProductAddToCart).click();
    cy.wait('@addToCart');

    getElementByField(CypressFields.CheckoutCardNetwork).should('contain', 'visa');
    getElementByField(CypressFields.CheckoutPlaceOrder).click();

    cy.wait('@placeOrder').then(({ request, response }) => {
      expect(request.headers['baggage']).to.contain('demo.payment.card_type=visa');
      expect(response?.body.cardNetwork).to.eq('visa');
    });
  });

  it('prices express and international delivery higher than standard US delivery', () => {
    quote('standard', 'US').then(standardUs => {
      quote('express', 'US').its('units').should('be.gt', standardUs.units);
      quote('standard', 'NG').its('units').should('be.gt', standardUs.units);
    });
    quote('pickup', 'US').its('units').should('eq', 0);
  });
});

export {};
