import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Phone, Mic, MicOff, Volume2 } from 'lucide-react';
import { DailyClient, CallParticipant } from '@/lib/dailyClient';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';

interface CallScreenProps {
  roomUrl: string;
  token: string;
  userName: string;
  rtcCallId: string;
  onCallEnd: () => void;
}

export default function CallScreen({
  roomUrl,
  token,
  userName,
  rtcCallId,
  onCallEnd,
}: CallScreenProps) {
  const [participants, setParticipants] = useState<CallParticipant[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [duration, setDuration] = useState(0);
  const [isConnecting, setIsConnecting] = useState(true);
  const dailyClient = useRef<DailyClient | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    initCall();

    return () => {
      cleanup();
    };
  }, []);

  const initCall = async () => {
    try {
      dailyClient.current = new DailyClient(
        (updatedParticipants) => setParticipants(updatedParticipants),
        () => handleCallEnd('completed')
      );

      await dailyClient.current.join(roomUrl, token, userName);
      setIsConnecting(false);

      // Start timer
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);

      console.log('✅ Call connected');
    } catch (error) {
      console.error('❌ Failed to join call:', error);
      toast({
        title: 'Connection Failed',
        description: error instanceof Error ? error.message : 'Failed to connect to call',
        variant: 'destructive',
      });
      handleCallEnd('cancelled');
    }
  };

  const cleanup = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    dailyClient.current?.destroy();
  };

  const handleCallEnd = async (reason: string = 'completed') => {
    console.log('📴 Ending call, reason:', reason);
    
    cleanup();

    // End call on backend
    try {
      await supabase.functions.invoke('end-rtc-call', {
        body: { rtc_call_id: rtcCallId, reason },
      });
    } catch (error) {
      console.error('❌ Error ending call:', error);
    }

    onCallEnd();
  };

  const toggleMute = async () => {
    if (dailyClient.current) {
      const newMutedState = await dailyClient.current.toggleMute();
      setIsMuted(newMutedState);
    }
  };

  const toggleSpeaker = async () => {
    if (dailyClient.current) {
      const newSpeakerState = await dailyClient.current.toggleSpeaker();
      setIsSpeakerOn(newSpeakerState);
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const otherParticipant = participants.find((p) => !p.isLocal);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-900 to-gray-800 z-50 flex flex-col items-center justify-center p-6">
      {/* Status */}
      <div className="text-center mb-8">
        <h2 className="text-white text-2xl font-bold mb-2">
          {isConnecting ? 'Connecting...' : otherParticipant?.name || 'In Call'}
        </h2>
        <p className="text-gray-300 text-5xl font-bold tracking-wider">
          {formatDuration(duration)}
        </p>
      </div>

      {/* Participants */}
      {!isConnecting && (
        <div className="mb-8 text-center">
          <p className="text-gray-400 text-sm">
            {participants.length} participant{participants.length !== 1 ? 's' : ''} in call
          </p>
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-6">
        {/* Mute */}
        <Button
          size="lg"
          variant={isMuted ? 'destructive' : 'secondary'}
          className="w-16 h-16 rounded-full"
          onClick={toggleMute}
        >
          {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </Button>

        {/* End Call */}
        <Button
          size="lg"
          variant="destructive"
          className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600"
          onClick={() => handleCallEnd('completed')}
        >
          <Phone className="w-8 h-8" />
        </Button>

        {/* Speaker */}
        <Button
          size="lg"
          variant={isSpeakerOn ? 'default' : 'secondary'}
          className="w-16 h-16 rounded-full"
          onClick={toggleSpeaker}
        >
          <Volume2 className="w-6 h-6" />
        </Button>
      </div>
    </div>
  );
}
