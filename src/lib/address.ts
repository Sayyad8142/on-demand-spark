import { Database } from "@/integrations/supabase/types";

type Booking = Database["public"]["Tables"]["bookings"]["Row"];

// For now, bookings table uses text fields (community, flat_no) rather than foreign keys
// This type represents the current schema without joins
export type BookingWithAddress = Booking;

/**
 * Format booking address/flat number for display
 * 
 * @param booking - Booking object
 * @returns Formatted address string for display
 * 
 * Logic:
 * 1. If flat_no is 4-digit numeric, decode as PHF format: Tower/Floor/Door
 * 2. Otherwise, show as "Flat {flat_no}"
 * 
 * Note: Once bookings table has foreign keys to flats and communities tables,
 * this can be enhanced to use flat.display_name and community.flat_format
 */
export function formatBookingAddress(booking: BookingWithAddress): string {
  const flatNo = booking.flat_no;

  // Check if it's a 4-digit PHF code
  if (flatNo && /^\d{4}$/.test(flatNo.toString())) {
    const code = flatNo.toString();
    const tower = Number(code[0]);
    const floor = Number(code.slice(1, 3));
    const door = Number(code[3]);
    return `Tower ${tower} • Floor ${floor} • Door ${door}`;
  }

  // Fallback for non-PHF formats
  return flatNo ? `Flat ${flatNo}` : 'Flat not set';
}

/**
 * Parse PHF code (4-digit) into tower, floor, door components
 * Used for legacy bookings without joined data
 */
export function parsePHFCode(flatNo: string | null | undefined): {
  tower: number;
  floor: number;
  door: number;
} | null {
  if (!flatNo || !/^\d{4}$/.test(flatNo.toString())) {
    return null;
  }
  
  const code = flatNo.toString();
  return {
    tower: Number(code[0]),
    floor: Number(code.slice(1, 3)),
    door: Number(code[3])
  };
}

/**
 * Check if a flat number is a valid PHF code format
 */
export function isPHFCode(flatNo: string | null | undefined): boolean {
  return !!(flatNo && /^\d{4}$/.test(flatNo.toString()));
}
