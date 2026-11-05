package ai.neu205.one;
import org.junit.Test;import static org.junit.Assert.*;import java.util.*;
public class SpeechClausesTest {
 @Test public void waitsForSentenceNotFirstFragment(){SpeechClauses s=new SpeechClauses();assertTrue(s.accept("The carotid body",false).isEmpty());assertTrue(s.accept(" senses oxygen.",false).isEmpty());assertEquals(List.of("The carotid body senses oxygen."),s.accept(" ",false));}
 @Test public void hidesSplitReasoning(){SpeechClauses s=new SpeechClauses();assertTrue(s.accept("<thi",false).isEmpty());assertTrue(s.accept("nk>Private reasoning. More.",false).isEmpty());assertEquals(List.of("The answer is grounded."),s.accept("</think>The answer is grounded.",true));}
 @Test public void decimalSplitAcrossTokensIsNotSpokenAsTwoSentences(){SpeechClauses s=new SpeechClauses();assertTrue(s.accept("The value is 3.",false).isEmpty());assertTrue(s.accept("5 millimeters.",false).isEmpty());assertEquals(List.of("The value is 3.5 millimeters."),s.accept("",true));}
 @Test public void flushesFinalCoherentRemainder(){SpeechClauses s=new SpeechClauses();assertTrue(s.accept("A final answer",false).isEmpty());assertEquals(List.of("A final answer"),s.accept("",true));}
 @Test public void preservesVisiblePrefixAndHidesMultipleBlocks(){SpeechClauses s=new SpeechClauses();assertEquals(List.of("Visible answer.","Second answer."),s.accept("Visible answer.<think>Secret.</think>Second answer.<think>Hidden.</think>",false));}
 @Test public void everyMarkupSplitIsHidden(){String text="<think>Private reasoning.</think>Visible answer.";for(int i=1;i<text.length();i++){SpeechClauses s=new SpeechClauses();List<String> out=new ArrayList<>(s.accept(text.substring(0,i),false));out.addAll(s.accept(text.substring(i),true));assertEquals("split "+i,List.of("Visible answer."),out);}}
 @Test(expected=IllegalStateException.class) public void unfinishedThinkingIsNotFlushed(){SpeechClauses s=new SpeechClauses();s.accept("<think>Unfinished secret",true);}
 @Test(expected=IllegalStateException.class) public void rejectsUnboundedSentence(){new SpeechClauses().accept("x".repeat(8193),false);}
}
