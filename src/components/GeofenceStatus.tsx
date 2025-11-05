import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MapPin, Clock, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getCurrentLocation } from '@/lib/backgroundLocation';
import { useToast } from '@/hooks/use-toast';

interface GeofenceStatusProps {
  workerId: string;
}

export function GeofenceStatus({ workerId }: GeofenceStatusProps) {
  const [locationData, setLocationData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadLocationStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('workers')
        .select('in_geofence, last_seen_at, location_enabled, selected_community_id, communities(name)')
        .eq('id', workerId)
        .single();

      if (error) throw error;
      setLocationData(data as any);
    } catch (error) {
      console.error('Error loading location status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLocationStatus();
    
    // Refresh every 30 seconds
    const interval = setInterval(loadLocationStatus, 30000);
    return () => clearInterval(interval);
  }, [workerId]);

  const handleUpdateNow = async () => {
    try {
      const location = await getCurrentLocation();
      if (!location) {
        toast({
          title: 'Location unavailable',
          description: 'Could not get current location',
          variant: 'destructive'
        });
        return;
      }

      const { data, error } = await supabase.rpc('update_worker_location', {
        p_lat: location.lat,
        p_lng: location.lng
      });

      if (error) throw error;

      const result = data as any;
      toast({
        title: 'Location updated',
        description: result?.in_geofence ? 'Inside geofence' : 'Outside geofence'
      });

      await loadLocationStatus();
    } catch (error: any) {
      toast({
        title: 'Update failed',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  if (loading) {
    return (
      <Card className="p-4">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-muted rounded w-1/2"></div>
          <div className="h-4 bg-muted rounded w-3/4"></div>
        </div>
      </Card>
    );
  }

  if (!locationData) {
    return null;
  }

  const timeAgo = locationData.last_seen_at 
    ? Math.floor((Date.now() - new Date(locationData.last_seen_at).getTime()) / 1000)
    : null;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Location Status</h3>
        <Button onClick={handleUpdateNow} variant="outline" size="sm">
          Update Now
        </Button>
      </div>

      <div className="space-y-2">
        {/* Community */}
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">
            Community: <span className="font-medium">
              {(locationData.communities as any)?.name || 'Not selected'}
            </span>
          </span>
        </div>

        {/* Geofence status */}
        <div className="flex items-center gap-2">
          <Badge variant={locationData.in_geofence ? 'default' : 'secondary'}>
            {locationData.in_geofence ? 'Inside Geofence' : 'Outside Geofence'}
          </Badge>
        </div>

        {/* Location enabled */}
        <div className="flex items-center gap-2">
          {locationData.location_enabled ? (
            <>
              <Clock className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-600">
                Location ON • {timeAgo !== null ? `${timeAgo}s ago` : 'Never'}
              </span>
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Location OFF
              </span>
            </>
          )}
        </div>

        {/* Warning if location is stale */}
        {locationData.location_enabled && timeAgo !== null && timeAgo > 180 && (
          <div className="flex items-center gap-2 text-amber-600">
            <AlertCircle className="h-4 w-4" />
            <span className="text-xs">
              Location not updated recently. Check permissions.
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
