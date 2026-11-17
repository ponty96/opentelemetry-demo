<?php
// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

declare(strict_types=1);

namespace App\Application;

final class ShippingRates
{
    public const COST_PER_ITEM = 8.99;

    public const DELIVERY_MULTIPLIERS = [
        'standard' => 1.0,
        'express' => 1.8,
        'same_day' => 2.5,
        'pickup' => 0.0,
    ];

    public const COUNTRY_MULTIPLIERS = [
        'US' => 1.0,
        'CA' => 1.2,
        'GB' => 1.5,
        'DE' => 1.5,
    ];

    public const INTERNATIONAL_MULTIPLIER = 2.0;

    public static function deliveryMethod(?string $method): string
    {
        $method = strtolower(trim((string) $method));
        return array_key_exists($method, self::DELIVERY_MULTIPLIERS) ? $method : 'standard';
    }

    public static function countryMultiplier(?string $country): float
    {
        $country = strtoupper(trim((string) $country));
        if ($country === '') {
            return 1.0;
        }
        return self::COUNTRY_MULTIPLIERS[$country] ?? self::INTERNATIONAL_MULTIPLIER;
    }

    public static function quote(int $numberOfItems, ?string $deliveryMethod = null, ?string $country = null): float
    {
        $method = self::deliveryMethod($deliveryMethod);
        $base = self::COST_PER_ITEM * $numberOfItems;
        return round($base * self::DELIVERY_MULTIPLIERS[$method] * self::countryMultiplier($country), 2);
    }
}
