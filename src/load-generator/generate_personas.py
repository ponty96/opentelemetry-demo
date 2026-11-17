#!/usr/bin/env python3
# Copyright The OpenTelemetry Authors
# SPDX-License-Identifier: Apache-2.0
"""Regenerates people.json: python3 generate_personas.py [--count 200] [--seed 42]"""

import argparse
import json
import random
import uuid
from pathlib import Path

DISTRIBUTIONS = {
    "country": {"US": 40, "CA": 10, "GB": 12, "DE": 10, "NG": 8, "BR": 8, "JP": 6, "IN": 6},
    "tier": {"standard": 70, "plus": 25, "business": 5},
    "platform": {"web": 60, "ios": 25, "android": 15},
    "paymentMethod": {"card": 60, "apple_pay": 15, "google_pay": 8, "paypal": 10, "crypto": 3, "bnpl": 4},
    "cardNetwork": {"visa": 55, "mastercard": 30, "amex": 15},
    "deliveryMethod": {"standard": 60, "express": 25, "same_day": 10, "pickup": 5},
    "cryptoAsset": {"BTC": 50, "ETH": 30, "USDC": 20},
}

ADDRESSES = {
    "US": [("1600 Amphitheatre Parkway", "Mountain View", "CA", "94043"), ("1 Microsoft Way", "Redmond", "WA", "98052"), ("410 Terry Ave N", "Seattle", "WA", "98109")],
    "CA": [("100 Queen St W", "Toronto", "ON", "M5H 2N2"), ("1055 W Georgia St", "Vancouver", "BC", "V6E 3P3")],
    "GB": [("10 Downing St", "London", "England", "SW1A 2AA"), ("1 Deansgate", "Manchester", "England", "M3 1AZ")],
    "DE": [("Unter den Linden 77", "Berlin", "BE", "10117"), ("Marienplatz 8", "Munich", "BY", "80331")],
    "NG": [("1 Adeola Odeku St", "Lagos", "LA", "101241"), ("Plot 1 Shehu Shagari Way", "Abuja", "FC", "900211")],
    "BR": [("Av. Paulista 1578", "Sao Paulo", "SP", "01310-200"), ("Av. Atlantica 1702", "Rio de Janeiro", "RJ", "22021-001")],
    "JP": [("1-1 Chiyoda", "Tokyo", "Tokyo", "100-8111"), ("2-1 Umeda", "Osaka", "Osaka", "530-0001")],
    "IN": [("1 MG Road", "Bengaluru", "KA", "560001"), ("Nariman Point", "Mumbai", "MH", "400021")],
}

CURRENCIES = {"US": "USD", "CA": "CAD", "GB": "GBP", "DE": "EUR", "NG": "USD", "BR": "BRL", "JP": "JPY", "IN": "INR"}

CARD_PREFIXES = {"visa": ("4", 16), "mastercard": ("5", 16), "amex": ("37", 15)}


def pick(rng: random.Random, attribute: str) -> str:
    options = DISTRIBUTIONS[attribute]
    return rng.choices(list(options), weights=list(options.values()))[0]


def luhn_complete(partial: str) -> str:
    """Appends the Luhn check digit to partial."""
    total = 0
    for i, digit in enumerate(reversed(partial)):
        d = int(digit)
        if i % 2 == 0:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return partial + str((10 - total % 10) % 10)


def card_number(rng: random.Random, network: str) -> str:
    prefix, length = CARD_PREFIXES[network]
    if network == "mastercard":
        prefix += str(rng.randint(1, 5))
    body = prefix + "".join(str(rng.randint(0, 9)) for _ in range(length - len(prefix) - 1))
    number = luhn_complete(body)
    if length == 16:
        return "-".join(number[i:i + 4] for i in range(0, 16, 4))
    return number


def persona(rng: random.Random, index: int) -> dict:
    country = pick(rng, "country")
    street, city, state, zip_code = rng.choice(ADDRESSES[country])
    method = pick(rng, "paymentMethod")
    person = {
        "id": str(uuid.UUID(int=rng.getrandbits(128), version=4)),
        "email": f"shopper{index:03d}@example.com",
        "tier": pick(rng, "tier"),
        "platform": pick(rng, "platform"),
        "address": {"streetAddress": street, "zipCode": zip_code, "city": city, "state": state, "country": country},
        "userCurrency": CURRENCIES[country],
        "paymentMethod": method,
        "deliveryMethod": pick(rng, "deliveryMethod"),
    }
    if method == "card":
        network = pick(rng, "cardNetwork")
        person["cardNetwork"] = network
        person["creditCard"] = {
            "creditCardNumber": card_number(rng, network),
            "creditCardExpirationMonth": rng.randint(1, 12),
            "creditCardExpirationYear": rng.randint(2030, 2039),
            "creditCardCvv": rng.randint(100, 999),
        }
    if method == "crypto":
        person["cryptoAsset"] = pick(rng, "cryptoAsset")
    return person


def generate(count: int = 200, seed: int = 42) -> list:
    rng = random.Random(seed)
    return [persona(rng, i) for i in range(count)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=200)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("people.json"))
    args = parser.parse_args()
    args.output.write_text(json.dumps(generate(args.count, args.seed), indent=2) + "\n")
    print(f"Wrote {args.count} personas to {args.output}")


if __name__ == "__main__":
    main()
