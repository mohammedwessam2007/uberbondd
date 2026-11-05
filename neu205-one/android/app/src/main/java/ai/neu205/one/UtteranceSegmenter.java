package ai.neu205.one;

import java.io.ByteArrayOutputStream;
import java.util.ArrayDeque;
import java.util.Arrays;

/** Experimental adaptive energy endpointing. NOT a demonstrated whisper classifier.
 * Frames are 20 ms. Calibrate in silence for 400 ms; keep 300 ms of pre-roll.
 * Hysteresis retains quiet trailing qualifiers. Overlong speech is drained whole.
 */
final class UtteranceSegmenter {
    static final int FRAME=320, MAX_FRAMES=1500;
    private final int endFrames;
    private final double[] calibration=new double[20];
    private int calibrated, onset, quiet, frames, voiced;
    private boolean utterance, discarding;
    private double noise=8, rms;
    private final ByteArrayOutputStream pcm=new ByteArrayOutputStream();
    private final ArrayDeque<short[]> pre=new ArrayDeque<>();
    UtteranceSegmenter(){this(500);}
    UtteranceSegmenter(int silenceMs){
        if(silenceMs<200 || silenceMs>700)throw new IllegalArgumentException("Silence must be 200–700 ms");
        endFrames=(silenceMs+19)/20;
    }
    static final class Result {
        final byte[] pcm; final boolean tooLong;
        Result(byte[] pcm,boolean tooLong){this.pcm=pcm;this.tooLong=tooLong;}
    }
    boolean isCalibrated(){return calibrated>=20;}
    boolean isSpeech(){return utterance || discarding;}
    boolean isEndpointing(){return isSpeech() && quiet>0;}
    double getRms(){return rms;}
    double getNoise(){return noise;}
    void reset(){
        onset=quiet=frames=voiced=0;utterance=discarding=false;pcm.reset();pre.clear();
    }
    Result accept(short[] samples){
        if(samples.length!=FRAME)throw new IllegalArgumentException("Expected 20 ms frame");
        double sum=0; for(short s:samples)sum+=(double)s*s;
        rms=Math.sqrt(sum/FRAME);
        if(!isCalibrated()){
            calibration[calibrated++]=rms;
            if(isCalibrated()){
                double[] sorted=calibration.clone();Arrays.sort(sorted);
                noise=Math.max(2,sorted[5]); // lower quartile resists brief transients
            }
            return null;
        }
        double threshold=Math.max(utterance || discarding?8:10,
                noise*(utterance || discarding?1.35:1.9)+3);
        boolean speech=rms>threshold;
        if(discarding){
            quiet=speech?0:quiet+1;
            if(quiet>=endFrames){reset();return new Result(null,true);}
            return null;
        }
        if(!utterance){
            // Bounded updates: continuous speech cannot drive the baseline upward.
            if(!speech)noise=noise*.98+Math.min(rms,noise*1.2+1)*.02;
            pre.addLast(samples.clone());while(pre.size()>15)pre.removeFirst();
            onset=speech?onset+1:0;
            if(onset>=3){
                utterance=true;frames=onset;voiced=onset;quiet=0;
                while(!pre.isEmpty())append(pre.removeFirst());
            }
            return null;
        }
        append(samples);frames++;
        if(speech){quiet=0;voiced++;}else quiet++;
        if(frames>=MAX_FRAMES){
            pcm.reset();pre.clear();utterance=false;discarding=true;quiet=0;
            return null;
        }
        if(quiet>=endFrames){
            byte[] complete=voiced>=9?pcm.toByteArray():null;
            reset();return complete==null?null:new Result(complete,false);
        }
        return null;
    }
    private void append(short[] samples){for(short s:samples){pcm.write(s&255);pcm.write((s>>>8)&255);}}
}
