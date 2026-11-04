package ai.neu205.one;
import org.junit.Test;import static org.junit.Assert.*;import java.util.*;
public class SpeechClausesTest {
 @Test public void waitsForSentenceNotFirstFragment(){SpeechClauses s=new SpeechClauses();assertTrue(s.accept("The carotid body",false).isEmpty());assertEquals(List.of("The carotid body senses oxygen."),s.accept(" senses oxygen.",false));}
 @Test public void hidesSplitReasoning(){SpeechClauses s=new SpeechClauses();assertTrue(s.accept("<thi",false).isEmpty());assertTrue(s.accept("nk>Private reasoning. More.",false).isEmpty());assertEquals(List.of("The answer is grounded."),s.accept("</think>The answer is grounded.",false));}
 @Test public void flushesFinalCoherentRemainder(){SpeechClauses s=new SpeechClauses();assertTrue(s.accept("A final answer",false).isEmpty());assertEquals(List.of("A final answer"),s.accept("",true));}
 @Test(expected=IllegalStateException.class) public void rejectsUnboundedSentence(){new SpeechClauses().accept("x".repeat(8193),false);}
}
