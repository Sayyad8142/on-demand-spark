import { useState, useEffect } from 'react';

interface IncomingCall {
  rtcCallId: string;
  callerName: string;
}

export function useIncomingCall() {
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'INCOMING_RTC_CALL') {
        console.log('📞 Received incoming call event:', event.data);
        setIncomingCall({
          rtcCallId: event.data.rtcCallId,
          callerName: event.data.callerName || 'Unknown Caller',
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const dismissCall = () => {
    setIncomingCall(null);
  };

  return { incomingCall, dismissCall };
}
