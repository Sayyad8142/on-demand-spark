import DailyIframe, { DailyCall, DailyEventObjectParticipant } from '@daily-co/daily-js';

export interface CallParticipant {
  id: string;
  name: string;
  isLocal: boolean;
  isMuted: boolean;
  isSpeakerOn: boolean;
}

export class DailyClient {
  private callObject: DailyCall | null = null;
  private onParticipantUpdate?: (participants: CallParticipant[]) => void;
  private onCallEnd?: () => void;

  constructor(
    onParticipantUpdate?: (participants: CallParticipant[]) => void,
    onCallEnd?: () => void
  ) {
    this.onParticipantUpdate = onParticipantUpdate;
    this.onCallEnd = onCallEnd;
  }

  async join(roomUrl: string, token: string, userName: string): Promise<void> {
    try {
      console.log('🎥 Joining Daily.co call:', roomUrl);
      
      this.callObject = DailyIframe.createCallObject({
        audioSource: true,
        videoSource: false, // Audio-only
      });

      this.setupEventListeners();

      await this.callObject.join({
        url: roomUrl,
        token,
        userName,
      });

      console.log('✅ Joined call successfully');
    } catch (error) {
      console.error('❌ Failed to join call:', error);
      throw error;
    }
  }

  private setupEventListeners(): void {
    if (!this.callObject) return;

    this.callObject.on('participant-joined', this.handleParticipantChange.bind(this));
    this.callObject.on('participant-updated', this.handleParticipantChange.bind(this));
    this.callObject.on('participant-left', this.handleParticipantChange.bind(this));
    
    this.callObject.on('left-meeting', () => {
      console.log('📴 Left meeting');
      this.onCallEnd?.();
    });

    this.callObject.on('error', (error) => {
      console.error('❌ Daily.co error:', error);
    });
  }

  private handleParticipantChange(): void {
    if (!this.callObject) return;

    const participants = this.callObject.participants();
    const participantList: CallParticipant[] = Object.values(participants).map((p) => ({
      id: p.session_id,
      name: p.user_name || 'Unknown',
      isLocal: p.local,
      isMuted: !p.audio,
      isSpeakerOn: true, // Always true for audio-only
    }));

    this.onParticipantUpdate?.(participantList);
  }

  async toggleMute(): Promise<boolean> {
    if (!this.callObject) return false;
    
    const isCurrentlyMuted = this.callObject.localAudio();
    await this.callObject.setLocalAudio(!isCurrentlyMuted);
    console.log('🎤', isCurrentlyMuted ? 'Unmuted' : 'Muted');
    return !isCurrentlyMuted;
  }

  async toggleSpeaker(): Promise<boolean> {
    // For web, speaker is always on. This is mainly for UI consistency with native
    console.log('🔊 Speaker toggle (web audio output cannot be controlled)');
    return true;
  }

  async leave(): Promise<void> {
    if (!this.callObject) return;

    console.log('📴 Leaving call');
    await this.callObject.leave();
    await this.callObject.destroy();
    this.callObject = null;
  }

  destroy(): void {
    if (this.callObject) {
      this.callObject.destroy();
      this.callObject = null;
    }
  }
}
