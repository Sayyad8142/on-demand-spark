/**
 * useDemoData - Provides fake in-memory data for guest/demo mode
 * 
 * This hook returns sample bookings, earnings, and worker profile data
 * that can be used when the app is in guest mode without hitting the database.
 */

import { useState } from 'react';

export interface DemoBooking {
  id: string;
  service_type: string;
  status: string;
  created_at: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  cust_name: string;
  cust_phone: string;
  flat_no: string;
  community: string;
  price_inr: number;
  notes: string | null;
  booking_type: string;
}

export interface DemoWorkerProfile {
  id: string;
  full_name: string;
  phone: string;
  service_types: string[];
  community: string;
  communities: string[];
  is_available: boolean;
  is_active: boolean;
  rating: number;
  total_ratings: number;
  total_earnings: number;
  photo_url: string | null;
  upi_id: string;
}

export function useDemoData() {
  const [demoBookings, setDemoBookings] = useState<DemoBooking[]>([
    {
      id: 'demo-booking-1',
      service_type: 'maid',
      status: 'new',
      created_at: new Date().toISOString(),
      scheduled_date: null,
      scheduled_time: null,
      cust_name: 'Ramesh Kumar',
      cust_phone: '+91 98765 43210',
      flat_no: 'A-301',
      community: 'Palm Greens',
      price_inr: 350,
      notes: 'Please bring cleaning supplies',
      booking_type: 'instant'
    },
    {
      id: 'demo-booking-2',
      service_type: 'cook',
      status: 'accepted',
      created_at: new Date(Date.now() - 3600000).toISOString(),
      scheduled_date: null,
      scheduled_time: null,
      cust_name: 'Priya Sharma',
      cust_phone: '+91 98765 43211',
      flat_no: 'B-205',
      community: 'Palm Greens',
      price_inr: 450,
      notes: 'North Indian food, 4 people',
      booking_type: 'instant'
    },
    {
      id: 'demo-booking-3',
      service_type: 'bathroom_cleaning',
      status: 'completed',
      created_at: new Date(Date.now() - 86400000).toISOString(),
      scheduled_date: null,
      scheduled_time: null,
      cust_name: 'Amit Patel',
      cust_phone: '+91 98765 43212',
      flat_no: 'C-102',
      community: 'Palm Greens',
      price_inr: 200,
      notes: '2 bathrooms',
      booking_type: 'instant'
    }
  ]);

  const demoWorkerProfile: DemoWorkerProfile = {
    id: 'demo-worker-1',
    full_name: 'Demo Worker',
    phone: '+91 98765 00000',
    service_types: ['maid', 'cook', 'bathroom_cleaning'],
    community: 'Palm Greens',
    communities: ['Palm Greens', 'Sunshine Apartments'],
    is_available: true,
    is_active: true,
    rating: 4.7,
    total_ratings: 127,
    total_earnings: 7200,
    photo_url: null,
    upi_id: 'demo@upi'
  };

  const demoEarnings = {
    today: 350,
    thisMonth: 7200,
    completedJobs: 23
  };

  // Simulate accepting a booking in demo mode
  const acceptDemoBooking = (bookingId: string) => {
    setDemoBookings(prev => 
      prev.map(b => 
        b.id === bookingId ? { ...b, status: 'accepted' } : b
      )
    );
  };

  // Simulate starting work in demo mode
  const startDemoWork = (bookingId: string) => {
    setDemoBookings(prev => 
      prev.map(b => 
        b.id === bookingId ? { ...b, status: 'started' } : b
      )
    );
  };

  // Simulate completing work in demo mode
  const completeDemoWork = (bookingId: string) => {
    setDemoBookings(prev => 
      prev.map(b => 
        b.id === bookingId ? { ...b, status: 'completed' } : b
      )
    );
  };

  return {
    demoBookings,
    demoWorkerProfile,
    demoEarnings,
    acceptDemoBooking,
    startDemoWork,
    completeDemoWork
  };
}
