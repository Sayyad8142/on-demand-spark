# Offline Mode Guide

The Didi Now Worker App includes comprehensive offline support to ensure workers can continue using the app even without internet connectivity.

## Features

### 1. **Automatic Offline Detection**
- Detects when the device goes offline/online
- Shows visual indicator when offline
- Automatically syncs when connection is restored

### 2. **Sync Queue System**
- Queues actions taken while offline
- Automatically syncs when back online
- Manual sync option available
- Persistent storage using Capacitor Preferences

### 3. **Offline Banner**
- Real-time connection status indicator
- Shows count of pending sync items
- Manual sync button
- Animated transitions

### 4. **Data Caching**
- Caches critical data locally
- TTL (Time To Live) support
- Automatic cache expiration
- Fast app loading even offline

### 5. **Optimistic Updates**
- Immediate UI feedback
- Reverts on error
- Better user experience

## Usage

### Using Offline Detection

```typescript
import { useOfflineMode } from '@/hooks/useOfflineMode';

function MyComponent() {
  const { isOnline, wasOffline } = useOfflineMode();

  return (
    <div>
      {!isOnline && <p>You're currently offline</p>}
      {wasOffline && isOnline && <p>Connection restored!</p>}
    </div>
  );
}
```

### Using Sync Queue

```typescript
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useOfflineMode } from '@/hooks/useOfflineMode';

function BookingActions() {
  const { isOnline } = useOfflineMode();
  const { addToQueue } = useOfflineSync();

  const updateBookingStatus = async (bookingId: string, status: string) => {
    if (!isOnline) {
      // Queue for later
      await addToQueue('update_booking_status', {
        bookingId,
        status,
        timestamp: new Date().toISOString()
      });
      toast.info('Action queued for sync');
    } else {
      // Update immediately
      await supabase
        .from('bookings')
        .update({ status })
        .eq('id', bookingId);
    }
  };

  return <button onClick={() => updateBookingStatus('123', 'completed')}>
    Complete Booking
  </button>;
}
```

### Using Offline Cache

```typescript
import { useOfflineCache } from '@/hooks/useOfflineCache';

function WorkerProfile() {
  const { cachedData, saveToCache, isLoading } = useOfflineCache<Worker>({
    key: 'worker_profile',
    ttl: 1000 * 60 * 60 // 1 hour
  });

  useEffect(() => {
    const loadProfile = async () => {
      const { data } = await supabase
        .from('workers')
        .select('*')
        .single();
      
      if (data) {
        await saveToCache(data); // Cache for offline use
      }
    };

    if (!cachedData) {
      loadProfile();
    }
  }, []);

  if (isLoading) return <Loading />;

  return <div>
    {cachedData && <ProfileCard worker={cachedData} />}
  </div>;
}
```

## Supported Actions

The following actions are queued when offline:

1. **Update Booking Status** (`update_booking_status`)
   - Accept booking
   - Start booking  
   - Complete booking
   - Cancel booking

2. **Update Availability** (`update_availability`)
   - Toggle available/unavailable status

3. **Update Profile** (`update_profile`)
   - Profile information changes
   - Service preferences
   - Community selections

## Manual Sync

Users can manually trigger sync from:
- **Offline Banner** - Click "Sync Now" button
- **Troubleshoot Page** - Clear cache and force sync

## Best Practices

### 1. Always Check Online Status
```typescript
const { isOnline } = useOfflineMode();

if (!isOnline) {
  // Show offline UI or queue action
} else {
  // Perform online action
}
```

### 2. Use Optimistic Updates
```typescript
// Update UI immediately
setStatus('completed');

try {
  if (isOnline) {
    await updateOnServer();
  } else {
    await addToQueue(/* ... */);
  }
} catch (error) {
  // Revert on error
  setStatus(previousStatus);
}
```

### 3. Cache Critical Data
- Worker profile
- Active bookings
- Availability settings
- Service types and communities

### 4. Inform Users
- Show offline indicator
- Explain queued actions
- Confirm when synced

## Troubleshooting

### Sync Queue Not Processing
1. Check internet connection
2. Try manual sync from offline banner
3. Check console for errors
4. Clear cache from Troubleshoot page

### Data Not Caching
1. Ensure sufficient device storage
2. Check TTL settings
3. Verify cache key uniqueness
4. Clear and rebuild cache

### Offline Banner Not Showing
1. Check if `OfflineBanner` is in App.tsx
2. Verify network detection working
3. Test by toggling device airplane mode

## Testing Offline Mode

### In Browser (Dev Tools)
1. Open Chrome DevTools
2. Go to Network tab
3. Select "Offline" from throttling dropdown
4. Test app functionality

### On Device
1. Enable Airplane Mode
2. Test app features
3. Toggle WiFi/Data off
4. Verify sync on reconnection

### Automated Testing
```typescript
// Mock offline state
jest.mock('@/hooks/useOfflineMode', () => ({
  useOfflineMode: () => ({ isOnline: false, wasOffline: true })
}));

// Test component behavior
test('shows offline message when offline', () => {
  render(<MyComponent />);
  expect(screen.getByText(/offline/i)).toBeInTheDocument();
});
```

## Technical Details

### Storage
- Uses Capacitor Preferences for persistence
- Works on both web and native platforms
- Encrypted storage on native platforms

### Network Detection
- Listens to browser `online`/`offline` events
- Periodic connection checks on native (every 5s)
- Custom `networkReconnected` event

### Sync Queue Format
```typescript
interface SyncQueueItem {
  id: string;                // Unique identifier
  type: string;              // Action type
  data: any;                 // Action payload
  timestamp: number;         // When queued
}
```

### Cache Format
```typescript
interface CachedData<T> {
  data: T;                   // Cached content
  timestamp: number;         // When cached
}
```

## Performance

- **Minimal overhead**: Only active when offline
- **Fast local reads**: Cached data loads instantly
- **Efficient sync**: Batches updates
- **Background processing**: Doesn't block UI

## Security

- Queue stored locally (encrypted on native)
- No sensitive data in queue
- Auth tokens refreshed on reconnect
- Sync requires valid session

## Future Enhancements

- [ ] Conflict resolution for concurrent edits
- [ ] Priority queue (critical actions first)
- [ ] Offline image caching
- [ ] Background sync on native
- [ ] Partial sync (incremental updates)
- [ ] Offline notifications
