export const pricingFixture = () => ({
  schema_version: 'worker-pricing-catalogue-v1', currency: 'INR', time_zone: 'Asia/Kolkata',
  generated_at: new Date().toISOString(), config_revision: 'synthetic-not-production',
  quote_status: 'parity_unverified', customer_specific_quote_available: false,
  communities: [{
    id: '11111111-1111-4111-8111-111111111111', value: 'synthetic-community', name: 'Preview Community',
    association_verification: 'admin_verified',
    commission: { percent: 7, source: 'communities.platform_fee_percent', rounding: 'floor_whole_rupees', estimate_only: true },
    services: [{
      service_key: 'maid', flat_sizes: [{ flat_size: '4BHK_PREMIUM', floor_cleaning_inr: 121, dish_washing_light_inr: 83, combined_light_inr: 197, combined_discount_inr: 7, floor_source: 'community', dish_source: 'global' }],
      dish_workloads: [
        { intensity: 'light', label: 'Light', description: 'Synthetic light description', extra_inr: 0, source: 'global' },
        { intensity: 'medium', label: 'Medium', description: 'Synthetic medium description', extra_inr: 17, source: 'community' },
        { intensity: 'heavy', label: 'Heavy', description: 'Synthetic heavy description', extra_inr: 31, source: 'global' },
      ],
    }, { service_key: 'bathroom_cleaning', unit_price_inr: 151, glass_partition_price_inr: 0, glass_quantity_rule: 'all_selected_bathrooms', source: 'global', customer_client_quantity_range: { min: 1, max: 4 } }],
    slots: [{ service_key: 'maid', slot_time: '10:00:00', adjustment_inr: -13 }],
    loyalty: { depends_on_customer: true, personalised_amount_inr: null, admin_tiers: [{ min_completed: 0, max_completed: 3, surcharge_inr: 0 }], parity_verified: false },
    warnings: [{ code: 'DISH_INSERT_FORMULA_DIFFERS' }],
  }],
});