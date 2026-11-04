package ai.neu205.one;
import org.junit.Test;import org.junit.runner.RunWith;import org.robolectric.RobolectricTestRunner;import org.robolectric.annotation.Config;import static org.junit.Assert.*;
@RunWith(RobolectricTestRunner.class) @Config(sdk=35)
public class TurnMemoryTest {
 @Test public void thirtyFollowupsStayInsideFrozenSixMessageContract()throws Exception{TurnMemory m=new TurnMemory();for(int i=0;i<30;i++){m.add("user",i==0?"carotid body":"why? "+i);assertTrue(m.snapshot().length()<=6);m.add("assistant","A grounded explanation.");assertTrue(m.snapshot().length()<=6);}assertEquals(6,m.snapshot().length());assertEquals(3,m.topics().length());assertEquals("why? 27",m.snapshot().getJSONObject(0).getString("content"));}
 @Test(expected=IllegalArgumentException.class) public void refusesOversizedHistoryRatherThanTruncatingQualifier()throws Exception{new TurnMemory().add("user","x".repeat(2001));}
 @Test public void clearsPrivateContextAtNewSession()throws Exception{TurnMemory m=new TurnMemory();m.add("user","What about the vagus nerve?");m.clear();assertEquals(0,m.snapshot().length());}
}
