package ai.neu205.one;
import org.junit.Test;
import static org.junit.Assert.*;
/** Synthetic PCM regression tests, not whisper recognition measurements. */
public class UtteranceSegmenterTest {
    private short[] tone(int amplitude){short[] s=new short[320];for(int i=0;i<s.length;i++)s[i]=(short)(Math.sin(i*.2)*amplitude);return s;}
    private void feed(UtteranceSegmenter vad,int frames,int amplitude){for(int i=0;i<frames;i++)assertNull(vad.accept(tone(amplitude)));}
    private UtteranceSegmenter calibrated(){UtteranceSegmenter s=new UtteranceSegmenter();feed(s,20,4);assertTrue(s.isCalibrated());return s;}
    @Test public void lowAmplitudeSpeechBelowOldFixedFloorCanEndpoint(){
        UtteranceSegmenter s=calibrated();feed(s,30,35);assertTrue(s.isSpeech());
        UtteranceSegmenter.Result r=null;for(int i=0;i<25;i++)r=s.accept(tone(4));assertNotNull(r);assertFalse(r.tooLong);assertTrue(r.pcm.length>320*2*30);
    }
    @Test public void trailingQualifierAfterShortPauseIsPreserved(){
        UtteranceSegmenter s=calibrated();feed(s,25,100);feed(s,15,4);feed(s,20,80);
        UtteranceSegmenter.Result r=null;for(int i=0;i<25;i++)r=s.accept(tone(4));assertNotNull(r);assertTrue(r.pcm.length>=320*2*80);
    }
    @Test public void entireOverlongQuestionIsDrainedWithoutPrefixOrTail(){
        UtteranceSegmenter s=calibrated();feed(s,1600,100);assertTrue(s.isSpeech());
        UtteranceSegmenter.Result r=null;for(int i=0;i<25;i++)r=s.accept(tone(4));assertNotNull(r);assertTrue(r.tooLong);assertNull(r.pcm);
        feed(s,30,4);assertFalse(s.isSpeech());
    }
    @Test public void noiseAtMeasuredBaselineDoesNotTrigger(){UtteranceSegmenter s=calibrated();feed(s,3000,4);assertFalse(s.isSpeech());}
    @Test public void digitalSilenceCanBeFollowedByAQuestion(){UtteranceSegmenter s=new UtteranceSegmenter();feed(s,6000,0);assertFalse(s.isSpeech());feed(s,30,35);UtteranceSegmenter.Result r=null;for(int i=0;i<25;i++)r=s.accept(tone(0));assertNotNull(r);}
    @Test public void briefTransientIsRejected(){UtteranceSegmenter s=calibrated();feed(s,4,100);feed(s,25,4);assertFalse(s.isSpeech());}
    @Test public void nextUtteranceAutomaticallyEndpoints(){
        UtteranceSegmenter s=calibrated();for(int question=0;question<10;question++){
            feed(s,30,35);UtteranceSegmenter.Result r=null;for(int i=0;i<25;i++)r=s.accept(tone(4));assertNotNull(r);
        }
    }
    @Test(expected=IllegalArgumentException.class) public void malformedFrameRejected(){new UtteranceSegmenter().accept(new short[319]);}
    @Test(expected=IllegalArgumentException.class) public void unsafeEndpointThresholdRejected(){new UtteranceSegmenter(100);}
}
