package ai.neu205.one;
/** Shared generation clock: stopping invalidates every asynchronous callback. */
final class ConversationState {
 enum Stage { IDLE, STARTING, LISTENING, SPEECH_ENDING, TRANSCRIBING, RETRIEVING, QWEN_STREAMING, SPEAKING, STOPPING, ERROR, STOPPED }
 private long generation; private Stage stage=Stage.IDLE;
 synchronized long begin(){generation++;stage=Stage.STARTING;return generation;}
 synchronized boolean live(long token){return token==generation && stage!=Stage.STOPPED && stage!=Stage.ERROR && stage!=Stage.IDLE && stage!=Stage.STOPPING;}
 synchronized boolean move(long token,Stage next){if(!live(token))return false;stage=next;return true;}
 synchronized void stop(boolean error){generation++;stage=error?Stage.ERROR:Stage.STOPPED;}
 synchronized Stage get(){return stage;}
}
