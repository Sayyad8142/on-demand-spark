import { Database } from "@/integrations/supabase/types";
import { isVillaCommunity } from "@/lib/communityTypes";

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
 * 1. If flat_no is 4-digit numeric, decode as PHF format: Tower/Floor/Door (1-2-1)
 * 2. If flat_no is 5-digit numeric, decode as extended PHF format: Tower/Floor/Door (2-2-1)
 * 3. Otherwise, show as "Flat {flat_no}"
 * 
 * Note: Once bookings table has foreign keys to flats and communities tables,
 * this can be enhanced to use flat.display_name and community.flat_format
 */
export function formatBookingAddress(booking: BookingWithAddress): string {
  const flatNo = booking.flat_no;

  // Villa communities: never parse the number as an apartment code
  if (isVillaBooking(booking)) {
    return formatVillaLabel(flatNo);
  }


  // Check if it's a 5-digit PHF code (2-2-1 format: TT-FF-D)
  if (flatNo && /^\d{5}$/.test(flatNo.toString())) {
    const code = flatNo.toString();
    const tower = code.slice(0, 2);
    const floor = code.slice(2, 4);
    const door = code[4];
    return `Tower ${tower} • Floor ${floor} • Door ${door}`;
  }

  // Check if it's a 4-digit PHF code (1-2-1 format: T-FF-D)
  if (flatNo && /^\d{4}$/.test(flatNo.toString())) {
    const code = flatNo.toString();
    const tower = code[0];
    const floor = code.slice(1, 3);
    const door = code[3];
    return `Tower ${tower} • Floor ${floor} • Door ${door}`;
  }

  // Fallback for non-PHF formats
  return flatNo ? `Flat ${flatNo}` : 'Flat not set';
}

/**
 * Parse PHF code into tower, floor, door components
 * Supports both 4-digit (1-2-1) and 5-digit (2-2-1) formats
 * Used for legacy bookings without joined data
 */
export function parsePHFCode(flatNo: string | null | undefined): {
  tower: string;
  floor: string;
  door: string;
} | null {
  if (!flatNo) return null;
  
  const code = flatNo.toString();
  
  // 5-digit format: TT-FF-D (e.g., 10116 = Tower 10, Floor 11, Door 6)
  if (/^\d{5}$/.test(code)) {
    return {
      tower: code.slice(0, 2),
      floor: code.slice(2, 4),
      door: code[4]
    };
  }
  
  // 4-digit format: T-FF-D (e.g., 9116 = Tower 9, Floor 11, Door 6)
  if (/^\d{4}$/.test(code)) {
    return {
      tower: code[0],
      floor: code.slice(1, 3),
      door: code[3]
    };
  }
  
  return null;
}

/**
 * Check if a flat number is a valid PHF code format (4 or 5 digits)
 */
export function isPHFCode(flatNo: string | null | undefined): boolean {
  return !!(flatNo && /^\d{4,5}$/.test(flatNo.toString()));
}

/**
 * Villa support (Phase 2B)
 * -------------------------------------------------------------
 * Villa communities store the villa number in `flat_no`. It is a whole
 * number (e.g. 425) and must NEVER be split into Tower / Floor / Door.
 */

export function isVillaBooking(
  booking: { community?: string | null; community_type?: string | null; display_name?: string | null } | null | undefined
): boolean {
  if (!booking) return false;
  const explicit = (booking as any).community_type;
  if (explicit) return explicit === 'villa';
  return isVillaCommunity(booking.community);
}

/**
 * "Villa 425" — prefers flats.display_name when it is available on the payload.
 */
export function formatVillaLabel(
  flatNo: string | number | null | undefined,
  displayName?: string | null
): string {
  if (displayName && displayName.trim()) return displayName.trim();
  const v = flatNo != null ? flatNo.toString().trim() : '';
  if (!v) return 'Villa not set';
  return /^villa/i.test(v) ? v : `Villa ${v}`;
}

/**
 * Single entry point used by booking UI: returns the unit label plus whether
 * apartment-specific Tower/Floor/Door blocks should be rendered.
 */
export function getUnitDisplay(booking: {
  community?: string | null;
  flat_no?: string | null;
  community_type?: string | null;
  display_name?: string | null;
}): { isVilla: boolean; label: string; phf: { tower: string; floor: string; door: string } | null } {
  if (isVillaBooking(booking)) {
    return {
      isVilla: true,
      label: formatVillaLabel(booking.flat_no, (booking as any).display_name),
      phf: null,
    };
  }
  return {
    isVilla: false,
    label: booking.flat_no ? `Flat ${booking.flat_no}` : 'Flat not set',
    phf: parsePHFCode(booking.flat_no),
  };
}
