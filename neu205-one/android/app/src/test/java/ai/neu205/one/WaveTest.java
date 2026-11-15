package ai.neu205.one;
import org.junit.Test;import org.junit.runner.RunWith;import org.robolectric.RobolectricTestRunner;import org.robolectric.annotation.Config;import java.nio.*;import static org.junit.Assert.*;
@RunWith(RobolectricTestRunner.class) @Config(sdk=35)
public class WaveTest {
 @Test public void wavPreservesPcmAndMedicalFinalQualifier(){byte[] pcm={1,2,3,4};byte[] wav=ConversationService.wave(pcm);assertEquals(48,wav.length);ByteBuffer b=ByteBuffer.wrap(wav).order(ByteOrder.LITTLE_ENDIAN);assertEquals(16000,b.getInt(24));assertEquals(4,b.getInt(40));assertEquals(1,wav[44]);assertEquals(4,wav[47]);}
}
