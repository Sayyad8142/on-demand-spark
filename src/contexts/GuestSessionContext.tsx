/**
 * GuestSessionContext - Manages demo/guest mode for Google Play reviewers and internal testing
 * 
 * This context provides:
 * - isGuest: boolean flag indicating if user is in guest/demo mode
 * - enterGuestMode(): Function to enable guest mode
 * - exitGuestMode(): Function to exit guest mode and return to login
 * 
 * Guest mode allows users to explore the worker app without authentication
 * and without affecting real bookings or data in the database.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const GUEST_MODE_KEY = 'didi_worker_is_guest';

interface GuestSessionContextType {
  isGuest: boolean;
  enterGuestMode: () => void;
  exitGuestMode: () => void;
}

const GuestSessionContext = createContext<GuestSessionContextType | undefined>(undefined);

export function GuestSessionProvider({ children }: { children: ReactNode }) {
  const [isGuest, setIsGuest] = useState<boolean>(false);

  // Restore guest mode state from localStorage on mount
  useEffect(() => {
    const storedGuestMode = localStorage.getItem(GUEST_MODE_KEY);
    if (storedGuestMode === 'true') {
      console.log('🎭 Restoring guest mode from localStorage');
      setIsGuest(true);
    }
  }, []);

  const enterGuestMode = () => {
    console.log('🎭 Entering guest/demo mode');
    setIsGuest(true);
    localStorage.setItem(GUEST_MODE_KEY, 'true');
  };

  const exitGuestMode = () => {
    console.log('🎭 Exiting guest/demo mode');
    setIsGuest(false);
    localStorage.removeItem(GUEST_MODE_KEY);
  };

  return (
    <GuestSessionContext.Provider value={{ isGuest, enterGuestMode, exitGuestMode }}>
      {children}
    </GuestSessionContext.Provider>
  );
}

export function useGuestSession() {
  const context = useContext(GuestSessionContext);
  if (context === undefined) {
    throw new Error('useGuestSession must be used within a GuestSessionProvider');
  }
  return context;
}
