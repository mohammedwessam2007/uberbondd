package ai.neu205.one;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import org.junit.Test;

public class StreamingUtf8Test {
    @Test public void preservesEveryByteBoundaryIncludingSupplementaryCharacters() throws Exception {
        String text = "Neurons: αβ, 脳, 🧠.\n";
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        for (int split = 0; split <= bytes.length; split++) {
            StreamingUtf8 decoder = new StreamingUtf8();
            String result = decoder.accept(Arrays.copyOfRange(bytes, 0, split), false)
                    + decoder.accept(Arrays.copyOfRange(bytes, split, bytes.length), false)
                    + decoder.accept(new byte[0], true);
            assertEquals(text, result);
        }
        StreamingUtf8 decoder = new StreamingUtf8();
        StringBuilder result = new StringBuilder();
        for (byte b : bytes) result.append(decoder.accept(new byte[]{b}, false));
        result.append(decoder.accept(new byte[0], true));
        assertEquals(text, result.toString());
    }

    @Test public void rejectsMalformedAndTruncatedBytes() throws Exception {
        try {
            new StreamingUtf8().accept(new byte[]{(byte) 0xc3, 0x28}, false);
            fail("Malformed UTF-8 must fail");
        } catch (CharacterCodingException expected) { }
        StreamingUtf8 decoder = new StreamingUtf8();
        assertEquals("", decoder.accept(new byte[]{(byte) 0xe2, (byte) 0x82}, false));
        try {
            decoder.accept(new byte[0], true);
            fail("Truncated UTF-8 must fail at end of generation");
        } catch (CharacterCodingException expected) { }
    }
}
