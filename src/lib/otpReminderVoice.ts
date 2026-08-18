
import { Capacitor } from "@capacitor/core";

let currentUtterance: SpeechSynthesisUtterance | null = null;
let isPlaying = false;

export function playOtpReminderVoice() {
  if (isPlaying) return;
  
  const text = "OTP pending. Please enter customer OTP.";
  const repeatCount = 3;
  let spokeCount = 0;

  const speak = () => {
    if (spokeCount >= repeatCount) {
      isPlaying = false;
      return;
    }

    currentUtterance = new SpeechSynthesisUtterance(text);
    currentUtterance.rate = 0.9;
    currentUtterance.pitch = 1;
    currentUtterance.volume = 1;

    currentUtterance.onend = () => {
      spokeCount++;
      // Small pause between repeats
      setTimeout(speak, 1000);
    };

    currentUtterance.onerror = (e) => {
      console.error("Speech error:", e);
      isPlaying = false;
    };

    window.speechSynthesis.speak(currentUtterance);
  };

  isPlaying = true;
  speak();
}

export function stopOtpReminderVoice() {
  window.speechSynthesis.cancel();
  currentUtterance = null;
  isPlaying = false;
}
