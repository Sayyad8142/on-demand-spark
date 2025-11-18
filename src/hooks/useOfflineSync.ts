import { useState, useEffect, useCallback } from 'react';
import { Preferences } from '@capacitor/preferences';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SyncQueueItem {
  id: string;
  type: 'update_booking_status' | 'update_availability' | 'update_profile';
  data: any;
  timestamp: number;
}

const SYNC_QUEUE_KEY = 'offline_sync_queue';

export function useOfflineSync() {
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // Load sync queue from storage
  useEffect(() => {
    loadSyncQueue();
  }, []);

  const loadSyncQueue = async () => {
    try {
      const { value } = await Preferences.get({ key: SYNC_QUEUE_KEY });
      if (value) {
        const queue = JSON.parse(value) as SyncQueueItem[];
        setSyncQueue(queue);
      }
    } catch (error) {
      console.error('Failed to load sync queue:', error);
    }
  };

  const saveSyncQueue = async (queue: SyncQueueItem[]) => {
    try {
      await Preferences.set({
        key: SYNC_QUEUE_KEY,
        value: JSON.stringify(queue)
      });
      setSyncQueue(queue);
    } catch (error) {
      console.error('Failed to save sync queue:', error);
    }
  };

  // Add item to sync queue
  const addToQueue = useCallback(async (
    type: SyncQueueItem['type'],
    data: any
  ) => {
    const newItem: SyncQueueItem = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      data,
      timestamp: Date.now()
    };

    const updatedQueue = [...syncQueue, newItem];
    await saveSyncQueue(updatedQueue);
    
    toast.info('Action queued for sync', {
      description: 'Will sync when connection is restored'
    });
  }, [syncQueue]);

  // Process sync queue
  const processSyncQueue = useCallback(async () => {
    if (syncQueue.length === 0 || isSyncing) return;

    setIsSyncing(true);
    console.log(`🔄 Processing ${syncQueue.length} queued items...`);

    const remainingQueue: SyncQueueItem[] = [];
    let successCount = 0;
    let failCount = 0;

    for (const item of syncQueue) {
      try {
        await processQueueItem(item);
        successCount++;
        console.log(`✅ Synced: ${item.type}`, item.data);
      } catch (error) {
        console.error(`❌ Failed to sync: ${item.type}`, error);
        remainingQueue.push(item);
        failCount++;
      }
    }

    await saveSyncQueue(remainingQueue);
    
    if (successCount > 0) {
      toast.success(`Synced ${successCount} action${successCount > 1 ? 's' : ''}`, {
        description: failCount > 0 ? `${failCount} failed, will retry` : 'All caught up!'
      });
    }

    setIsSyncing(false);
  }, [syncQueue, isSyncing]);

  const processQueueItem = async (item: SyncQueueItem) => {
    switch (item.type) {
      case 'update_booking_status':
        const { bookingId, status, timestamp } = item.data;
        await supabase
          .from('bookings')
          .update({ 
            status,
            [`${status}_at`]: timestamp
          })
          .eq('id', bookingId);
        break;

      case 'update_availability':
        const { userId, isAvailable } = item.data;
        await supabase
          .from('workers')
          .update({ is_available: isAvailable })
          .eq('id', userId);
        break;

      case 'update_profile':
        await supabase
          .from('workers')
          .update(item.data.updates)
          .eq('id', item.data.userId);
        break;

      default:
        throw new Error(`Unknown sync type: ${item.type}`);
    }
  };

  // Listen for network reconnection
  useEffect(() => {
    const handleReconnect = () => {
      console.log('🔄 Network reconnected, processing sync queue...');
      processSyncQueue();
    };

    window.addEventListener('networkReconnected', handleReconnect);
    return () => window.removeEventListener('networkReconnected', handleReconnect);
  }, [processSyncQueue]);

  // Clear sync queue (for testing/manual)
  const clearQueue = async () => {
    await saveSyncQueue([]);
    toast.success('Sync queue cleared');
  };

  return {
    syncQueue,
    isSyncing,
    addToQueue,
    processSyncQueue,
    clearQueue,
    hasQueuedItems: syncQueue.length > 0
  };
}
