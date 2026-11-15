package ai.neu205.one;
import org.junit.Test;import static org.junit.Assert.*;
public class ConversationStateTest {
 @Test public void stopInvalidatesAllPendingStages(){ConversationState s=new ConversationState();long old=s.begin();for(ConversationState.Stage stage:new ConversationState.Stage[]{ConversationState.Stage.TRANSCRIBING,ConversationState.Stage.RETRIEVING,ConversationState.Stage.SPEAKING}){assertTrue(s.move(old,stage));}s.stop(false);assertFalse(s.live(old));assertFalse(s.move(old,ConversationState.Stage.LISTENING));assertEquals(ConversationState.Stage.STOPPED,s.get());}
 @Test public void startStopStormNeverRevivesOldGeneration(){ConversationState s=new ConversationState();for(int i=0;i<10000;i++){long old=s.begin();s.stop(false);long fresh=s.begin();assertFalse(s.move(old,ConversationState.Stage.SPEAKING));assertTrue(s.live(fresh));}}
 @Test public void errorsRequireFreshStart(){ConversationState s=new ConversationState();long id=s.begin();s.stop(true);assertFalse(s.live(id));assertEquals(ConversationState.Stage.ERROR,s.get());assertTrue(s.live(s.begin()));}
}
