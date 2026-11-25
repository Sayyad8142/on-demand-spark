/** Admin's illustrative test fixture for get_my_service_pricing (25 Nov 2026). Test-only: never imported by
 * application code and never a production fallback price. generated_at is refreshed so freshness can be tested. */
const adminFixture = {
  "version": "worker-service-pricing-v1",
  "revision": "test-pricing-v1",
  "last_updated_at": "2026-11-25T07:00:00Z",
  "generated_at": "2026-11-25T07:31:02Z",
  "loyalty_tiers": [
    {
      "id": "test-1",
      "min_completed": 0,
      "max_completed": 3,
      "surcharge_inr": 0
    },
    {
      "id": "test-2",
      "min_completed": 4,
      "max_completed": 6,
      "surcharge_inr": 10
    },
    {
      "id": "test-3",
      "min_completed": 7,
      "max_completed": 9,
      "surcharge_inr": 15
    },
    {
      "id": "test-4",
      "min_completed": 10,
      "max_completed": null,
      "surcharge_inr": 20
    }
  ],
  "loyalty_note": "Loyalty amount depends on each customer booking.",
  "communities": [
    {
      "community": "prestige-high-fields",
      "community_name": "Prestige High Fields",
      "commission_percent": 0,
      "maid": [
        {
          "flat_size": "2BHK",
          "task": "floor_cleaning",
          "price_inr": 89,
          "source": "global",
          "worker_estimate_inr": 89
        },
        {
          "flat_size": "2BHK",
          "task": "dish_washing",
          "price_inr": 89,
          "source": "global",
          "worker_estimate_inr": 89
        },
        {
          "flat_size": "2.5BHK",
          "task": "floor_cleaning",
          "price_inr": 89,
          "source": "global",
          "worker_estimate_inr": 89
        },
        {
          "flat_size": "2.5BHK",
          "task": "dish_washing",
          "price_inr": 89,
          "source": "global",
          "worker_estimate_inr": 89
        },
        {
          "flat_size": "3BHK",
          "task": "floor_cleaning",
          "price_inr": 99,
          "source": "global",
          "worker_estimate_inr": 99
        },
        {
          "flat_size": "3BHK",
          "task": "dish_washing",
          "price_inr": 89,
          "source": "global",
          "worker_estimate_inr": 89
        },
        {
          "flat_size": "3.5BHK",
          "task": "floor_cleaning",
          "price_inr": 99,
          "source": "global",
          "worker_estimate_inr": 99
        },
        {
          "flat_size": "3.5BHK",
          "task": "dish_washing",
          "price_inr": 89,
          "source": "global",
          "worker_estimate_inr": 89
        },
        {
          "flat_size": "4BHK",
          "task": "floor_cleaning",
          "price_inr": 119,
          "source": "global",
          "worker_estimate_inr": 119
        },
        {
          "flat_size": "4BHK",
          "task": "dish_washing",
          "price_inr": 99,
          "source": "global",
          "worker_estimate_inr": 99
        },
        {
          "flat_size": "4BHK_PREMIUM",
          "task": "floor_cleaning",
          "price_inr": 129,
          "source": "global",
          "worker_estimate_inr": 129
        },
        {
          "flat_size": "4BHK_PREMIUM",
          "task": "dish_washing",
          "price_inr": 99,
          "source": "global",
          "worker_estimate_inr": 99
        }
      ],
      "dish_extras": [
        {
          "intensity": "light",
          "extra_inr": 0,
          "label": "Light",
          "description": "10-15 items"
        },
        {
          "intensity": "medium",
          "extra_inr": 19,
          "label": "Medium",
          "description": "15-20 items"
        },
        {
          "intensity": "heavy",
          "extra_inr": 29,
          "label": "Heavy",
          "description": "20+ items"
        }
      ],
      "bathroom": {
        "unit_price_inr": 149,
        "glass_partition_price_inr": 19,
        "source": "global"
      },
      "slot_adjustments": [
        {
          "service": "maid",
          "slot_time": "08:00:00",
          "adjustment_inr": 20
        },
        {
          "service": "maid",
          "slot_time": "11:00:00",
          "adjustment_inr": -10
        }
      ]
    },
    {
      "community": "my_home_bhooja",
      "community_name": "My Home Bhooja",
      "commission_percent": 0,
      "maid": [
        {
          "flat_size": "2BHK",
          "task": "floor_cleaning",
          "price_inr": 109,
          "source": "community",
          "worker_estimate_inr": 109
        },
        {
          "flat_size": "2BHK",
          "task": "dish_washing",
          "price_inr": 108,
          "source": "community",
          "worker_estimate_inr": 108
        },
        {
          "flat_size": "2.5BHK",
          "task": "floor_cleaning",
          "price_inr": 119,
          "source": "community",
          "worker_estimate_inr": 119
        },
        {
          "flat_size": "2.5BHK",
          "task": "dish_washing",
          "price_inr": 109,
          "source": "community",
          "worker_estimate_inr": 109
        },
        {
          "flat_size": "3BHK",
          "task": "floor_cleaning",
          "price_inr": 129,
          "source": "community",
          "worker_estimate_inr": 129
        },
        {
          "flat_size": "3BHK",
          "task": "dish_washing",
          "price_inr": 119,
          "source": "community",
          "worker_estimate_inr": 119
        },
        {
          "flat_size": "3.5BHK",
          "task": "floor_cleaning",
          "price_inr": 139,
          "source": "community",
          "worker_estimate_inr": 139
        },
        {
          "flat_size": "3.5BHK",
          "task": "dish_washing",
          "price_inr": 129,
          "source": "community",
          "worker_estimate_inr": 129
        },
        {
          "flat_size": "4BHK",
          "task": "floor_cleaning",
          "price_inr": 128,
          "source": "community",
          "worker_estimate_inr": 128
        },
        {
          "flat_size": "4BHK",
          "task": "dish_washing",
          "price_inr": 138,
          "source": "community",
          "worker_estimate_inr": 138
        },
        {
          "flat_size": "4BHK_PREMIUM",
          "task": "floor_cleaning",
          "price_inr": 148,
          "source": "community",
          "worker_estimate_inr": 148
        },
        {
          "flat_size": "4BHK_PREMIUM",
          "task": "dish_washing",
          "price_inr": 139,
          "source": "community",
          "worker_estimate_inr": 139
        }
      ],
      "dish_extras": [
        {
          "intensity": "light",
          "extra_inr": 0,
          "label": "Light",
          "description": "10-15 items"
        },
        {
          "intensity": "medium",
          "extra_inr": 19,
          "label": "Medium",
          "description": "15-20 items"
        },
        {
          "intensity": "heavy",
          "extra_inr": 29,
          "label": "Heavy",
          "description": "20+ items"
        }
      ],
      "bathroom": {
        "unit_price_inr": 159,
        "glass_partition_price_inr": 30,
        "source": "community"
      },
      "slot_adjustments": []
    }
  ]
};

export const servicePricingDraftFixture = (): typeof adminFixture =>
  ({ ...structuredClone(adminFixture), generated_at: new Date().toISOString() });
