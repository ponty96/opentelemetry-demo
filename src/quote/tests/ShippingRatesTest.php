<?php
// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

declare(strict_types=1);

require __DIR__ . '/../src/Application/ShippingRates.php';

use App\Application\ShippingRates;

$cases = [
    'legacy request keeps the flat per-item price' => [ShippingRates::quote(2), 17.98],
    'standard to the US' => [ShippingRates::quote(2, 'standard', 'US'), 17.98],
    'express to the US' => [ShippingRates::quote(1, 'express', 'US'), 16.18],
    'same day to Canada' => [ShippingRates::quote(1, 'same_day', 'CA'), 26.97],
    'standard to Germany' => [ShippingRates::quote(1, 'standard', 'DE'), 13.49],
    'express to Nigeria' => [ShippingRates::quote(1, 'express', 'NG'), 32.36],
    'pickup is free' => [ShippingRates::quote(3, 'pickup', 'JP'), 0.0],
    'unknown method falls back to standard' => [ShippingRates::quote(1, 'teleport', 'us'), 8.99],
];

$failures = 0;
foreach ($cases as $name => [$got, $want]) {
    if (abs($got - $want) > 0.001) {
        fwrite(STDERR, "FAIL {$name}: got {$got}, want {$want}\n");
        $failures++;
    } else {
        echo "ok   {$name}\n";
    }
}
exit($failures === 0 ? 0 : 1);
