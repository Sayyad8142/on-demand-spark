# Booking Address Schema Migration

## Current Implementation

The Worker App currently displays flat/address information using text fields in the `bookings` table:
- `community` (text) - Community name as text
- `flat_no` (text) - Flat number as text

The address formatting logic in `src/lib/address.ts` uses a simple heuristic:
- **4-digit flat numbers** → Decoded as PHF format: `Tower X • Floor YY • Door Z`
- **Other formats** → Displayed as: `Flat {flat_no}`

## Recommended Schema Enhancement

To support proper address formatting for all communities (PHF, tower/flat, etc.), the following schema changes are recommended:

### 1. Add Foreign Keys to Bookings Table

```sql
-- Add community_id foreign key
ALTER TABLE bookings 
ADD COLUMN community_id UUID REFERENCES communities(id);

-- Add flat_id foreign key  
ALTER TABLE bookings
ADD COLUMN flat_id UUID REFERENCES flats(id);

-- Backfill community_id from community text (one-time migration)
UPDATE bookings b
SET community_id = c.id
FROM communities c
WHERE b.community = c.value;

-- Backfill flat_id from flat_no text (one-time migration)
-- This requires matching flat_no to flats table
UPDATE bookings b
SET flat_id = f.id
FROM flats f
WHERE b.flat_no = f.flat_no 
  AND b.community_id = f.community_id;

-- Make community_id NOT NULL after backfill
ALTER TABLE bookings 
ALTER COLUMN community_id SET NOT NULL;

-- Create indexes for performance
CREATE INDEX idx_bookings_community_id ON bookings(community_id);
CREATE INDEX idx_bookings_flat_id ON bookings(flat_id);
```

### 2. Update Address Formatting Logic

Once foreign keys are in place, update `src/lib/address.ts` to use joined data:

```typescript
export type BookingWithAddress = Booking & {
  communities?: Community | null;
  flats?: (Flat & {
    buildings?: Building | null;
  }) | null;
};

export function formatBookingAddress(booking: BookingWithAddress): string {
  // Priority 1: Use pre-computed display_name if available
  if (booking.flats?.display_name) {
    return booking.flats.display_name;
  }

  const flatNo = booking.flat_no;
  const flatFormat = booking.communities?.flat_format;

  // Priority 2: PHF format (4-digit code)
  if (flatFormat === 'phf_code' && flatNo && /^\d{4}$/.test(flatNo.toString())) {
    const code = flatNo.toString();
    const tower = Number(code[0]);
    const floor = Number(code.slice(1, 3));
    const door = Number(code[3]);
    return `Tower ${tower} • Floor ${floor} • Door ${door}`;
  }

  // Priority 3: Tower/Flat format with building name
  if (flatFormat === 'tower_flat') {
    const buildingName = booking.flats?.buildings?.name;
    if (buildingName) {
      return `${buildingName} • Flat ${flatNo || 'N/A'}`;
    }
    return `Flat ${flatNo || 'N/A'}`;
  }

  // Fallback
  return flatNo ? `Flat ${flatNo}` : 'Flat not set';
}
```

### 3. Update Booking Queries

Update all booking queries to include joins:

```typescript
const { data } = await supabase
  .from('bookings')
  .select(`
    *,
    communities!bookings_community_id_fkey (
      id,
      name,
      flat_format
    ),
    flats!bookings_flat_id_fkey (
      id,
      flat_no,
      display_name,
      tower,
      floor,
      door,
      buildings (
        id,
        name
      )
    )
  `)
  .eq('worker_id', workerId);
```

## Benefits

1. **Accurate Formatting**: Display addresses correctly for all community types (PHF, tower/flat, etc.)
2. **Admin Control**: Admins can set custom `display_name` in flats table for special cases
3. **Data Integrity**: Foreign key constraints ensure valid references
4. **Future-Proof**: Easy to add new address formats or community types
5. **Performance**: Indexed foreign keys improve query performance

## Migration Steps

1. Add `community_id` and `flat_id` columns to bookings table
2. Backfill foreign keys from existing text fields
3. Create indexes
4. Update TypeScript types (regenerate from Supabase)
5. Update address formatting logic in `src/lib/address.ts`
6. Update all booking queries to include joins
7. Test with all community types (PHF, tower/flat, etc.)
8. Optionally deprecate `community` and `flat_no` text columns after validation

## Current Workaround

Until the schema migration is completed, the current implementation:
- Uses 4-digit detection to identify PHF codes
- Falls back to "Flat {flat_no}" for other formats
- Works correctly for PHF communities
- Has limited support for tower/flat communities (shows "Flat 3005" instead of "Block-1 • Flat 3005")
