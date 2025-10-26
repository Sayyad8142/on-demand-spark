import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { booking_id, reject_reason = 'worker_rejected' } = await req.json();
    if (!booking_id) {
      return new Response(JSON.stringify({ error: 'booking_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`🔄 Reassigning booking ${booking_id}, reason: ${reject_reason}`);

    // Get booking details
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*, worker_id')
      .eq('id', booking_id)
      .single();

    if (bookingError || !booking) {
      return new Response(JSON.stringify({ error: 'Booking not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Track previously tried workers
    const previousWorkerId = booking.worker_id;

    // Reset booking to pending
    await supabase
      .from('bookings')
      .update({
        status: 'pending',
        worker_id: null,
        worker_name: null,
        worker_phone: null,
        worker_upi: null,
        worker_photo_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking_id);

    // Find next available worker
    const { data: workers, error: workersError } = await supabase
      .from('workers')
      .select('id, full_name, phone, fcm_token, rating, total_ratings')
      .eq('is_active', true)
      .eq('is_available', true)
      .eq('is_busy', false)
      .contains('service_types', [booking.service_type])
      .or(`community.eq.${booking.community},communities.cs.{${booking.community}}`)
      .neq('id', previousWorkerId) // Exclude previous worker
      .order('rating', { ascending: false })
      .order('total_ratings', { ascending: false })
      .limit(5);

    if (workersError || !workers || workers.length === 0) {
      console.warn(`⚠️ No available workers for booking ${booking_id}`);
      return new Response(JSON.stringify({ ok: true, reassigned_to: null, message: 'No workers available' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Assign to first available worker
    const nextWorker = workers[0];
    
    const { error: assignError } = await supabase
      .from('bookings')
      .update({
        status: 'dispatched',
        worker_id: nextWorker.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking_id);

    if (assignError) {
      console.error('Error assigning to next worker:', assignError);
      return new Response(JSON.stringify({ error: 'Failed to reassign' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Send FCM notification to next worker
    if (nextWorker.fcm_token) {
      try {
        await supabase.functions.invoke('send-fcm', {
          body: {
            token: nextWorker.fcm_token,
            notification: {
              title: 'New Booking Request',
              body: `${booking.service_type} - ${booking.community} ${booking.flat_no}`,
            },
            data: {
              type: 'new_booking',
              booking_id: booking.id,
              service_type: booking.service_type,
              flat_number: booking.flat_no,
              price: String(booking.price_inr || 0),
              notes: booking.notes || '',
              community: booking.community || 'Prestige High Fields',
            },
          },
        });
        console.log(`📱 FCM sent to worker ${nextWorker.id}`);
      } catch (fcmError) {
        console.error('FCM send failed:', fcmError);
      }
    }

    console.log(`✅ Booking ${booking_id} reassigned to worker ${nextWorker.id}`);

    return new Response(JSON.stringify({ 
      ok: true, 
      reassigned_to: nextWorker.id,
      worker_name: nextWorker.full_name 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in reassign-booking:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
