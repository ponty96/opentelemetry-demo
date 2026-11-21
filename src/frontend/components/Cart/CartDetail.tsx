// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { useRouter } from 'next/router';
import { v4 } from 'uuid';
import { useCallback, useState } from 'react';
import CartItems from '../CartItems';
import CheckoutForm from '../CheckoutForm';
import { IFormData } from '../CheckoutForm/CheckoutForm';
import SessionGateway from '../../gateways/Session.gateway';
import { useCart } from '../../providers/Cart.provider';
import { useCurrency } from '../../providers/Currency.provider';
import * as S from '../../styles/Cart.styled';
import { deliveryMethodType, ISegment, paymentMethodType } from '../../utils/Segments';

const { userId } = SessionGateway.getSession();

const CartDetail = () => {
  const {
    cart: { items },
    emptyCart,
    placeOrder,
  } = useCart();
  const { selectedCurrency } = useCurrency();
  const { push } = useRouter();
  const [segment, setSegment] = useState<ISegment>(() => SessionGateway.getSession().segment);

  const onSegmentChange = useCallback((change: Partial<ISegment>) => {
    SessionGateway.updateSegment(change);
    setSegment(current => ({ ...current, ...change }));
  }, []);

  const onPlaceOrder = useCallback(
    async ({
      email,
      state,
      streetAddress,
      country,
      city,
      zipCode,
      creditCardCvv,
      creditCardExpirationMonth,
      creditCardExpirationYear,
      creditCardNumber,
      paymentMethod,
      cryptoAsset,
      deliveryMethod,
    }: IFormData) => {
      const order = await placeOrder({
        userId,
        email,
        address: {
          streetAddress,
          state,
          country,
          city,
          zipCode,
        },
        userCurrency: selectedCurrency,
        creditCard:
          paymentMethod === 'card'
            ? {
                creditCardCvv,
                creditCardExpirationMonth,
                creditCardExpirationYear,
                creditCardNumber,
              }
            : undefined,
        paymentMethod: {
          type: paymentMethodType(paymentMethod),
          walletToken: ['apple_pay', 'google_pay', 'paypal'].includes(paymentMethod)
            ? `tok_${v4().replace(/-/g, '')}`
            : undefined,
          cryptoAsset: paymentMethod === 'crypto' ? cryptoAsset : undefined,
        },
        deliveryMethod: deliveryMethodType(deliveryMethod),
      });

      push({
        pathname: `/cart/checkout/${order.orderId}`,
        query: { order: JSON.stringify(order) },
      });
    },
    [placeOrder, push, selectedCurrency]
  );

  return (
    <S.Container>
      <div>
        <S.Header>
          <S.CarTitle>Shopping Cart</S.CarTitle>
          <S.EmptyCartButton onClick={emptyCart} $type="link">
            Empty Cart
          </S.EmptyCartButton>
        </S.Header>
        <CartItems productList={items} country={segment.country} deliveryMethod={segment.deliveryMethod} />
      </div>
      <CheckoutForm initialSegment={segment} onSubmit={onPlaceOrder} onSegmentChange={onSegmentChange} />
    </S.Container>
  );
};

export default CartDetail;
