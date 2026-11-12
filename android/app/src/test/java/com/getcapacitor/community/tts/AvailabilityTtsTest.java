package com.getcapacitor.community.tts;

import android.speech.tts.Voice;
import java.util.Locale;
import java.util.Collections;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowTextToSpeech;
import static org.junit.Assert.*;

/** Exercises the dependency's actual Android implementation, not browser speech. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28, manifest = Config.NONE)
public class AvailabilityTtsTest {
    private void speakLocale(String locale, String phrase) {
        Locale language = Locale.forLanguageTag(locale);
        ShadowTextToSpeech.addLanguageAvailability(language);
        ShadowTextToSpeech.addVoice(new Voice(locale, language, 300, 300, false, Collections.emptySet()));
        TextToSpeech engine = new TextToSpeech(RuntimeEnvironment.getApplication());
        engine.onInit(android.speech.tts.TextToSpeech.SUCCESS);
        assertTrue(engine.isAvailable());
        assertTrue(engine.isLanguageSupported(locale));
        engine.speak(phrase, locale, 0.85f, 1f, 1f, -1, "guide", new SpeakResultCallback() {
            public void onDone() {}
            public void onError() { fail("Speech failed"); }
            public void onRangeStart(int start, int end) {}
        });
        android.speech.tts.TextToSpeech actual = ShadowTextToSpeech.getLastTextToSpeechInstance();
        ShadowTextToSpeech shadow = org.robolectric.Shadows.shadowOf(actual);
        assertEquals(phrase, shadow.getLastSpokenText());
        assertEquals(language, shadow.getCurrentLanguage());
        engine.stop();
        assertTrue(shadow.isStopped());
        engine.onDestroy();
        assertTrue(shadow.isShutdown());
    }
    @Test public void englishAvailabilityInstructions() { speakLocale("en-IN", "Select your working hours."); }
    @Test public void hindiAvailabilityInstructions() { speakLocale("hi-IN", "काम के दिन और समय चुनें।"); }
    @Test public void teluguAvailabilityInstructions() { speakLocale("te-IN", "మీ పని సమయాలను ఎంచుకోండి."); }
}