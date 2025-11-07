import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Phone, PhoneOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import CallScreen from './CallScreen';

interface IncomingCallScreenProps {
  rtcCallId: string;
  callerName: string;
  onDismiss: () => void;
}

export default function IncomingCallScreen({
  rtcCallId,
  callerName,
  onDismiss,
}: IncomingCallScreenProps) {
  const [isAccepting, setIsAccepting] = useState(false);
  const [callAccepted, setCallAccepted] = useState(false);
  const [roomUrl, setRoomUrl] = useState('');
  const [token, setToken] = useState('');
  const { toast } = useToast();

  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      console.log('✅ Accepting call:', rtcCallId);
      
      const { data, error } = await supabase.functions.invoke('accept-rtc-call', {
        body: { rtc_call_id: rtcCallId },
      });

      if (error) throw error;

      setRoomUrl(data.room_url);
      setToken(data.callee_token);
      setCallAccepted(true);
    } catch (error) {
      console.error('❌ Error accepting call:', error);
      toast({
        title: 'Failed to Accept Call',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
      onDismiss();
    } finally {
      setIsAccepting(false);
    }
  };

  const handleReject = async () => {
    try {
      console.log('❌ Rejecting call:', rtcCallId);
      
      await supabase.functions.invoke('end-rtc-call', {
        body: { rtc_call_id: rtcCallId, reason: 'rejected' },
      });

      onDismiss();
    } catch (error) {
      console.error('❌ Error rejecting call:', error);
      onDismiss();
    }
  };

  if (callAccepted) {
    return (
      <CallScreen
        roomUrl={roomUrl}
        token={token}
        userName="You"
        rtcCallId={rtcCallId}
        onCallEnd={onDismiss}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-blue-900 to-blue-700 z-50 flex flex-col items-center justify-center p-6 animate-pulse">
      {/* Caller Info */}
      <div className="text-center mb-12">
        <div className="w-32 h-32 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-6">
          <Phone className="w-16 h-16 text-white" />
        </div>
        <h2 className="text-white text-3xl font-bold mb-2">Incoming Call</h2>
        <p className="text-blue-100 text-xl">{callerName}</p>
      </div>

      {/* Actions */}
      <div className="flex gap-8">
        {/* Reject */}
        <button
          onClick={handleReject}
          className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg transition-transform active:scale-95"
        >
          <PhoneOff className="w-8 h-8 text-white" />
        </button>

        {/* Accept */}
        <button
          onClick={handleAccept}
          disabled={isAccepting}
          className="w-20 h-20 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center shadow-lg transition-transform active:scale-95 disabled:opacity-50"
        >
          <Phone className="w-8 h-8 text-white" />
        </button>
      </div>

      {isAccepting && (
        <p className="text-white text-sm mt-8">Connecting...</p>
      )}
    </div>
  );
}
