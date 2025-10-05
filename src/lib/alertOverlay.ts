let wakeLock: any = null;
let audio: HTMLAudioElement | null = null;
let vibrationTimer: number | null = null;

export async function startAlertOverlay() {
  try {
    // Screen Wake Lock (best effort)
    if ('wakeLock' in navigator && (navigator as any).wakeLock?.request) {
      wakeLock = await (navigator as any).wakeLock.request('screen');
      console.log('Wake lock acquired');
    }
  } catch (error) {
    console.log('Wake lock not supported:', error);
  }

  try {
    // Sound (autoplay needs user gesture on some browsers; we'll start on button open)
    audio = new Audio('/sounds/booking_alert.mp3');
    audio.loop = true;
    await audio.play().catch(() => {
      console.log('Audio autoplay blocked, will play on user tap');
    });
  } catch (error) {
    console.log('Audio initialization failed:', error);
  }

  try {
    // Vibration pulse every ~1s (Android/Chrome)
    if ('vibrate' in navigator) {
      navigator.vibrate([300, 700]);
      vibrationTimer = window.setInterval(() => navigator.vibrate([300, 700]), 1000);
      console.log('Vibration started');
    }
  } catch (error) {
    console.log('Vibration not supported:', error);
  }

  // Add document class to enable full-screen styling
  document.documentElement.classList.add('alert-overlay-active');
}

export async function stopAlertOverlay() {
  try {
    if (wakeLock && wakeLock.release) {
      await wakeLock.release();
      console.log('Wake lock released');
    }
  } catch (error) {
    console.log('Wake lock release failed:', error);
  }
  
  wakeLock = null;
  
  if (audio) {
    try { 
      audio.pause();
      audio.currentTime = 0;
    } catch (error) {
      console.log('Audio stop failed:', error);
    }
    audio = null;
  }
  
  if (vibrationTimer) {
    clearInterval(vibrationTimer);
    vibrationTimer = null;
  }
  
  if ('vibrate' in navigator) {
    navigator.vibrate(0);
  }
  
  document.documentElement.classList.remove('alert-overlay-active');
}

export async function showStickyNotification(bookingData: { id: string; customerName: string; service: string }) {
  try {
    if (!('Notification' in window)) {
      console.log('Notifications not supported');
      return;
    }
    
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;
    }
    
    if (Notification.permission !== 'granted') return;
    
    const notification = new Notification('New Booking • 30s to respond', {
      body: `${bookingData.customerName} - ${bookingData.service}`,
      requireInteraction: true,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: `booking-${bookingData.id}`,
    });
    
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    
    console.log('Sticky notification shown');
  } catch (error) {
    console.log('Notification failed:', error);
  }
}
