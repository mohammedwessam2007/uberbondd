package ai.neu205.one;

import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.CoderResult;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;

/** Strict incremental decoder for model byte pieces, which may split a UTF-8 code point. */
final class StreamingUtf8 {
    private final CharsetDecoder decoder = StandardCharsets.UTF_8.newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT);
    private byte[] pending = new byte[0];
    private boolean finished;

    String accept(byte[] piece, boolean end) throws CharacterCodingException {
        if (finished) throw new IllegalStateException("Decoder already finished");
        byte[] input = new byte[pending.length + piece.length];
        System.arraycopy(pending, 0, input, 0, pending.length);
        System.arraycopy(piece, 0, input, pending.length, piece.length);
        ByteBuffer bytes = ByteBuffer.wrap(input);
        // UTF-8 never produces more UTF-16 code units than input bytes. A minimum
        // capacity of one also permits a final empty flush.
        CharBuffer chars = CharBuffer.allocate(Math.max(1, input.length));
        CoderResult result = decoder.decode(bytes, chars, end);
        if (result.isError()) result.throwException();
        if (result.isOverflow()) throw new IllegalStateException("Unexpected UTF-8 decoder overflow");
        pending = new byte[bytes.remaining()];
        bytes.get(pending);
        if (end) {
            result = decoder.flush(chars);
            if (result.isError()) result.throwException();
            if (result.isOverflow()) throw new IllegalStateException("Unexpected UTF-8 decoder flush overflow");
            finished = true;
        }
        chars.flip();
        return chars.toString();
    }
}
