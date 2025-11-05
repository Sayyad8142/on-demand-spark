import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface Community {
  id: string;
  name: string;
}

interface CommunitySelectorProps {
  workerId: string;
  value: string | null;
  onChange?: (communityId: string | null) => void;
}

export function CommunitySelector({ workerId, value, onChange }: CommunitySelectorProps) {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadCommunities();
  }, []);

  const loadCommunities = async () => {
    try {
      const { data, error } = await supabase
        .from('communities')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setCommunities(data || []);
    } catch (error) {
      console.error('Error loading communities:', error);
      toast({
        title: 'Error loading communities',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = async (communityId: string) => {
    try {
      const { error } = await supabase
        .from('workers')
        .update({ selected_community_id: communityId === 'none' ? null : communityId })
        .eq('id', workerId);

      if (error) throw error;

      toast({
        title: 'Community updated',
        description: 'Your selected community has been updated'
      });

      onChange?.(communityId === 'none' ? null : communityId);
    } catch (error: any) {
      toast({
        title: 'Update failed',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  if (loading) {
    return <div className="animate-pulse h-10 bg-muted rounded"></div>;
  }

  return (
    <div className="space-y-2">
      <Label>Selected Community</Label>
      <Select value={value || 'none'} onValueChange={handleChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select community" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No community selected</SelectItem>
          {communities.map((community) => (
            <SelectItem key={community.id} value={community.id}>
              {community.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        You'll only receive alerts for bookings in your selected community when you're within 100m
      </p>
    </div>
  );
}
