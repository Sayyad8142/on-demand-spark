import { Database } from "@/integrations/supabase/types";

type Worker = Database["public"]["Tables"]["workers"]["Row"];
type Booking = Database["public"]["Tables"]["bookings"]["Row"];

export const DEMO_WORKER: Worker = {
  id: "demo-worker-id",
  user_id: "demo-user-id",
  full_name: "Demo Partner",
  phone: "9999999999",
  service_types: ["maid", "cook", "bathroom"],
  community: "demo-community",
  communities: ["demo-community"],
  selected_community_id: "demo-community-id",
  is_active: true,
  is_available: true,
  is_busy: false,
  rating: 4.8,
  total_ratings: 127,
  total_earnings: 45000,
  photo_url: null,
  upi_id: "demo@upi",
  fcm_token: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  last_active_at: new Date().toISOString(),
  last_seen_at: new Date().toISOString(),
  last_lat: null,
  last_lng: null,
  in_geofence: true,
  location_enabled: false,
  respect_availability: true,
  timezone: "Asia/Kolkata"
};

export const DEMO_ACTIVE_JOB: Booking = {
  id: "demo-booking-active",
  user_id: "demo-customer-id",
  worker_id: "demo-worker-id",
  service_type: "maid",
  booking_type: "instant",
  status: "accepted",
  community: "demo-community",
  flat_no: "A-101",
  flat_size: "2bhk",
  cust_name: "Demo Customer",
  cust_phone: "9876543210",
  price_inr: 350,
  payout_amount: 280,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  accepted_at: new Date().toISOString(),
  assigned_at: new Date().toISOString(),
  scheduled_date: null,
  scheduled_time: null,
  started_at: null,
  completed_at: null,
  cancelled_at: null,
  on_the_way_at: null,
  confirmed_at: null,
  pay_enabled_at: null,
  user_marked_paid_at: null,
  can_cancel_until: null,
  auto_complete_at: null,
  auto_complete_after_minutes: null,
  cancel_reason: null,
  cancel_source: null,
  notes: "Demo booking for app preview",
  worker_name: "Demo Partner",
  worker_phone: "9999999999",
  worker_photo_url: null,
  worker_upi: "demo@upi",
  is_demo: true,
  prealert_sent: false,
  maid_tasks: ["floor_cleaning", "dish_washing"],
  bathroom_count: null,
  family_count: null,
  food_pref: null,
  cook_cuisine_pref: null,
  cook_gender_pref: null
};

export const DEMO_BOOKINGS: Booking[] = [
  DEMO_ACTIVE_JOB,
  {
    ...DEMO_ACTIVE_JOB,
    id: "demo-booking-1",
    service_type: "cook",
    status: "completed",
    flat_no: "B-204",
    price_inr: 400,
    payout_amount: 320,
    completed_at: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
    family_count: 4,
    food_pref: "veg"
  },
  {
    ...DEMO_ACTIVE_JOB,
    id: "demo-booking-2",
    service_type: "bathroom",
    status: "completed",
    flat_no: "C-305",
    price_inr: 250,
    payout_amount: 200,
    completed_at: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
    bathroom_count: 2
  }
];
