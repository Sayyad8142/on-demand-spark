import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = "https://paywwbuqycovjopryele.supabase.co";
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, serviceKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startTime = new Date().toISOString();
    console.log(`🕐 check-scheduled-bookings: Starting at ${startTime}`);

    // Find bookings that need alerts (scheduled to start in 10 minutes)
    // We need to combine scheduled_date and scheduled_time, subtract 10 minutes, and compare to now
    const { data: bookings, error: fetchError } = await supabase
      .from('bookings')
      .select('id, scheduled_date, scheduled_time, service_type, community, cust_name, flat_no, price_inr')
      .eq('status', 'pending')
      .eq('prealert_sent', false)
      .not('scheduled_date', 'is', null)
      .not('scheduled_time', 'is', null);

    if (fetchError) {
      console.error('❌ Error fetching bookings:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch bookings', details: fetchError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!bookings || bookings.length === 0) {
      console.log('📭 No scheduled bookings pending pre-alert');
      return new Response(
        JSON.stringify({ message: 'No bookings to process', count: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 Found ${bookings.length} scheduled bookings to check`);

    // Get current time
    const now = new Date();
    const alertsSent = [];

    // Check each booking to see if it needs an alert
    for (const booking of bookings) {
      // Combine date and time strings - interpret as IST (Asia/Kolkata timezone)
      // The database stores times without timezone, but users enter times in IST
      const scheduledDateTimeStr = `${booking.scheduled_date}T${booking.scheduled_time}`;
      
      // Parse the time in IST and convert to UTC for comparison
      // IST is UTC+5:30, so we need to subtract 5 hours 30 minutes to get UTC
      const [datePart, timePart] = scheduledDateTimeStr.split('T');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hours, minutes, seconds] = timePart.split(':').map(Number);
      
      // Create date in IST by adding the offset
      // IST = UTC + 5:30, so UTC = IST - 5:30
      const istDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds || 0));
      // Subtract IST offset (5 hours 30 minutes = 330 minutes) to get UTC
      const scheduledDateTime = new Date(istDate.getTime() - (5.5 * 60 * 60 * 1000));
      
      // Calculate 10 minutes before scheduled time
      const alertTime = new Date(scheduledDateTime.getTime() - 10 * 60 * 1000);
      
      console.log(`📊 Booking ${booking.id}:`);
      console.log(`   scheduled_ist=${scheduledDateTimeStr}`);
      console.log(`   scheduled_utc=${scheduledDateTime.toISOString()}`);
      console.log(`   alert_utc=${alertTime.toISOString()}`);
      console.log(`   now_utc=${now.toISOString()}`);
      console.log(`   should_alert=${now >= alertTime}`);

      // If current time is past the alert time, send notification
      if (now >= alertTime) {
        console.log(`🚨 TRIGGERING PRE-ALERT for scheduled booking ${booking.id}`);
        console.log(`   Service: ${booking.service_type}`);
        console.log(`   Community: ${booking.community}`);
        console.log(`   Customer: ${booking.cust_name}`);
        console.log(`   Flat: ${booking.flat_no}`);
        console.log(`   Price: ₹${booking.price_inr}`);

        // Call booking-notifications function with direct HTTP (like the database trigger does)
        // This ensures the Authorization header is properly included
        try {
          console.log(`📤 Calling booking-notifications for booking ${booking.id}...`);
          
          const notifyResponse = await fetch(`${SUPABASE_URL}/functions/v1/booking-notifications`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ booking_id: booking.id }),
          });

          const responseText = await notifyResponse.text();
          console.log(`📥 booking-notifications response (${notifyResponse.status}): ${responseText}`);

          if (!notifyResponse.ok) {
            console.error(`❌ Failed to send notification for booking ${booking.id}: ${notifyResponse.status} - ${responseText}`);
            continue;
          }

          // Try to parse as JSON for detailed logging
          try {
            const notifyResult = JSON.parse(responseText);
            console.log(`✅ Notification result for booking ${booking.id}:`, JSON.stringify(notifyResult, null, 2));
          } catch {
            console.log(`✅ Notification sent for booking ${booking.id} (non-JSON response)`);
          }
        } catch (notifyError) {
          console.error(`❌ Exception calling booking-notifications for booking ${booking.id}:`, notifyError);
          continue;
        }

        // Mark as prealert sent
        const { error: updateError } = await supabase
          .from('bookings')
          .update({ prealert_sent: true })
          .eq('id', booking.id);

        if (updateError) {
          console.error(`❌ Failed to update prealert_sent for booking ${booking.id}:`, updateError);
          continue;
        }

        alertsSent.push(booking.id);
        console.log(`✅ Successfully processed scheduled booking ${booking.id} - prealert_sent set to true`);
      } else {
        const minutesRemaining = Math.round((alertTime.getTime() - now.getTime()) / 60000);
        console.log(`⏳ Booking ${booking.id} not ready yet (${minutesRemaining} minutes until pre-alert)`);
      }
    }

    console.log(`📊 Summary: Checked ${bookings.length} bookings, sent ${alertsSent.length} alerts`);
    if (alertsSent.length > 0) {
      console.log(`📋 Alerted booking IDs: ${alertsSent.join(', ')}`);
    }

    return new Response(
      JSON.stringify({
        message: 'Scheduled bookings check complete',
        checked: bookings.length,
        alerts_sent: alertsSent.length,
        booking_ids: alertsSent
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in check-scheduled-bookings:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
