package ai.neu205.one;

import android.Manifest;import android.app.*;import android.content.*;import android.content.pm.*;import android.media.*;import android.os.*;import android.speech.tts.*;
import org.json.*;import java.io.*;import java.net.*;import java.nio.*;import java.nio.charset.StandardCharsets;import java.util.*;import java.util.concurrent.*;

/** Foreground half-duplex companion. No cloud ASR, boot receiver, or automatic process restart. */
public final class ConversationService extends Service {
 static final ConversationState state=new ConversationState();
 static volatile String detail="Ready",question="",answer="",pages="",failure="";
 private final Handler main=new Handler(Looper.getMainLooper());
 private final ExecutorService io=Executors.newSingleThreadExecutor(),cancelIo=Executors.newSingleThreadExecutor();
 private final Set<String> spokenIds=new HashSet<>();
 private PowerManager.OnThermalStatusChangedListener thermalListener;private boolean thermalRegistered;
 private volatile long generation;private volatile boolean running,busy=true;private volatile HttpURLConnection connection;
 private volatile AudioRecord recorder;private TextToSpeech tts;private AudioManager audio;private AudioFocusRequest focus;
 private volatile NativeBrain brain;
 private volatile java.util.concurrent.atomic.AtomicBoolean loadingCancelled=new java.util.concurrent.atomic.AtomicBoolean(true);
 private String key,requestId="",corpusHash="";private WhisperOnnx asr;private final TurnMemory history=new TurnMemory();private boolean voiceReady,backendReady,streamDone;private int utterances;
 private volatile long lastSampleAt,capturePending=-1;private long resumeAfter,stageSince,lastPowerPoll;private static final ArrayDeque<String> timings=new ArrayDeque<>();
 static synchronized String metadata(){return "NEU205 ONE candidate\nState: "+state.get()+"\nStage timestamps (elapsed realtime milliseconds):\n"+String.join("\n",timings)+"\nPHONE NOT TESTED. No audio/transcript/key/book content exported.";}
 private static synchronized void timing(String stage,long millis){if(timings.size()>=64)timings.removeFirst();timings.addLast(stage+":"+millis);}private AudioDeviceInfo previousCommunication;private boolean routeChanged,modeChanged;private int previousMode;
 static boolean active(){return state.live(instanceGeneration);} private static volatile long instanceGeneration=-1;
 private boolean live(long token){return running && state.live(token) && generation==token;}
 private void move(ConversationState.Stage s,String text){if(state.move(generation,s)){detail=text;stageSince=SystemClock.elapsedRealtime();timing(s.name(),stageSince);}}
 private void fail(String message){long token=generation;main.post(()->{if(live(token)){failure=message;detail=message;end(true);}});}
 @Override public void onCreate(){super.onCreate();thermalListener=status->{if(running && status>=PowerManager.THERMAL_STATUS_SEVERE)fail("Device temperature is too high. Let it cool before Start.");};try{((PowerManager)getSystemService(POWER_SERVICE)).addThermalStatusListener(getMainExecutor(),thermalListener);thermalRegistered=true;}catch(RuntimeException unavailable){thermalRegistered=false;}audio=(AudioManager)getSystemService(AUDIO_SERVICE);((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(new NotificationChannel("conversation","NEU205 study session",NotificationManager.IMPORTANCE_LOW));}
 @Override public int onStartCommand(Intent intent,int flags,int startId){
  if(intent==null)return START_NOT_STICKY;
  if("INTERRUPT".equals(intent.getAction())){interruptTurn();return START_NOT_STICKY;}
  if("STOP".equals(intent.getAction())){end(false);return START_NOT_STICKY;}
  if(running)return START_NOT_STICKY;
  NativeBrain stale=brain;brain=null;if(stale!=null)io.execute(()->{try{stale.close();}catch(IOException ignored){}});
  if(AssetRepository.importing()){detail="Finish or cancel the verified asset import before Start.";stopSelf();return START_NOT_STICKY;}
  voiceReady=false;backendReady=false;streamDone=false;spokenIds.clear();utterances=0;requestId="";history.clear();generation=state.begin();instanceGeneration=generation;running=true;busy=true;failure="";detail="Starting";stageSince=SystemClock.elapsedRealtime();
  key=getSharedPreferences("setup",MODE_PRIVATE).getString("key","");
  if(!NativeBrain.configured(this) && key.length()<32){fail("Import the signed book and Qwen model, or pair the local companion first.");return START_NOT_STICKY;}
  if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){fail("Microphone permission is required after you tap Start.");return START_NOT_STICKY;}
  try{
   Intent stop=new Intent(this,ConversationService.class).setAction("STOP");
   Notification n=new Notification.Builder(this,"conversation").setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentTitle("NEU205 ONE").setContentText("Private offline study · Stop ends microphone and speech").setOngoing(true).addAction(new Notification.Action.Builder(null,"Stop",PendingIntent.getService(this,1,stop,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT)).build()).build();
   startForeground(205,n,ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE|ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
   AudioAttributes attrs=new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build();
   focus=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(attrs).setOnAudioFocusChangeListener(change->{if(change<0)fail("Audio interrupted. Tap Start when ready.");},main).build();
   if(audio.requestAudioFocus(focus)!=AudioManager.AUDIOFOCUS_REQUEST_GRANTED)throw new IOException("Audio focus unavailable");
   previousCommunication=audio.getCommunicationDevice();previousMode=audio.getMode();if(previousMode!=AudioManager.MODE_IN_COMMUNICATION){audio.setMode(AudioManager.MODE_IN_COMMUNICATION);modeChanged=true;}
   AudioDeviceInfo speaker=null;for(AudioDeviceInfo d:audio.getAvailableCommunicationDevices())if(d.getType()==AudioDeviceInfo.TYPE_BUILTIN_SPEAKER)speaker=d;
   if(speaker==null || !audio.setCommunicationDevice(speaker))throw new IOException("Phone speaker route unavailable");routeChanged=true;
   long voiceToken=generation;tts=new TextToSpeech(this,status->main.post(()->{if(live(voiceToken))initializeVoice(status,attrs);}));
   long token=generation;java.util.concurrent.atomic.AtomicBoolean startup=new java.util.concurrent.atomic.AtomicBoolean();loadingCancelled=startup;io.execute(()->preflight(token,startup));main.post(watchdog);
  }catch(Exception e){fail("Startup failed: "+e.getClass().getSimpleName());}
  return START_NOT_STICKY;
 }
 private void initializeVoice(int status,AudioAttributes attrs){
  if(!running)return;
  if(status!=TextToSpeech.SUCCESS){fail("Install an offline English voice in Android voice settings.");return;}
  try{
   Voice selected=null;Set<Voice> voices=tts.getVoices();if(voices!=null)for(Voice v:voices)if(v.getLocale().getLanguage().equals("en") && !v.isNetworkConnectionRequired() && (v.getFeatures()==null || !v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED))){selected=v;break;}
   if(selected==null || tts.setVoice(selected)!=TextToSpeech.SUCCESS || tts.setAudioAttributes(attrs)!=TextToSpeech.SUCCESS){fail("No installed offline English voice. Open Android voice settings.");return;}
   tts.setSpeechRate(1f);tts.setOnUtteranceProgressListener(new UtteranceProgressListener(){
    @Override public void onStart(String id){main.post(()->{if(validSpeech(id))move(ConversationState.Stage.SPEAKING,"Speaking");});}
    @Override public void onDone(String id){main.post(()->{if(validSpeech(id)){spokenIds.remove(id);finishSpeech();}});}
    @Override public void onError(String id){main.post(()->{if(validSpeech(id))fail("Offline speech failed. Check installed voice.");});}
   });voiceReady=true;maybeCapture();
  }catch(RuntimeException e){fail("Offline voice unavailable.");}
 }
 private boolean validSpeech(String id){return running && id.startsWith(generation+":") && spokenIds.contains(id);}
 private void preflight(long token,java.util.concurrent.atomic.AtomicBoolean startup){
  HttpURLConnection c=null;
  try{String bundledCorpus=CorpusAssets.verify(this);asr=NativeAsr.load(this);if(!live(token))return;
   if(NativeBrain.configured(this)){
    if(getSharedPreferences("setup",MODE_PRIVATE).getBoolean("v11_memory",false) || getSharedPreferences("setup",MODE_PRIVATE).getBoolean("v11_exam",false))throw new IOException("Turn off experimental companion memory and exam modes to use native Qwen study mode.");
    NativeBrain loaded=NativeBrain.load(this,startup);
    synchronized(state){if(!live(token)){loaded.close();return;}brain=loaded;corpusHash=bundledCorpus;}
    main.post(()->{if(live(token)){backendReady=true;maybeCapture();}});return;
   }
   if(getSharedPreferences("setup",MODE_PRIVATE).getBoolean("termux_launch",false))launchCompanion();
   long deadline=SystemClock.elapsedRealtime()+150000;
   while(live(token)){
    try{c=LocalTransport.open("/v1/health",key);c.setRequestProperty("X-NEU205-Native-ASR","true");connection=c;LocalTransport.requireSuccess(c);break;}
    catch(IOException notReady){if(c!=null)c.disconnect();c=null;if(notReady instanceof LocalTransport.ReadinessException && ((LocalTransport.ReadinessException)notReady).permanent)throw notReady;if(SystemClock.elapsedRealtime()>=deadline || !getSharedPreferences("setup",MODE_PRIVATE).getBoolean("termux_launch",false))throw notReady;Thread.sleep(250);}
   }
   if(!live(token) || c==null)return;
   JSONObject health=new JSONObject(read(c.getInputStream(),65536));
   if(!health.optBoolean("ready"))throw new IOException("Companion needs the full book, offline ASR, and Qwen. Complete setup.");
   if(getSharedPreferences("setup",MODE_PRIVATE).getBoolean("v11_memory",false) && (health.optJSONObject("active_memory")==null || !health.getJSONObject("active_memory").optBoolean("ready")))throw new IOException("Experimental v11 memory index is not verified by the companion. Complete its private index setup or turn v11 memory off in Settings.");
   if(!"c3298e8c5f7f807604be10f7376d67f05eb315dd982276263e8f6ad2e8e70940".equals(health.optString("book_pdf_sha256")))throw new IOException("Book checksum mismatch. Reimport verified corpus.");
   if(!bundledCorpus.equals(health.optString("corpus_sha256")))throw new IOException("Paired book corpus differs from the signed candidate. Reimport the verified corpus.");corpusHash=bundledCorpus;main.post(()->{if(live(token)){backendReady=true;maybeCapture();}});
  }catch(UnsatisfiedLinkError absent){if(live(token))fail("This build lacks the native Qwen library. Install the verified native candidate.");}
  catch(Exception e){if(live(token))fail(e instanceof IOException && e.getMessage()!=null?e.getMessage():"Start the paired offline companion. No microphone has started.");}
  catch(OutOfMemoryError exhausted){if(live(token))fail("Not enough memory to load offline ASR. Close other apps and retry.");}
  finally{if(c!=null)c.disconnect();connection=null;}
 }
 private void launchCompanion()throws IOException {
  if(checkSelfPermission("com.termux.permission.RUN_COMMAND")!=PackageManager.PERMISSION_GRANTED)throw new IOException("Allow the optional Termux pairing permission in Settings first.");
  String termuxRoot;try{termuxRoot=getPackageManager().getApplicationInfo("com.termux",0).dataDir;}catch(PackageManager.NameNotFoundException missing){throw new IOException("Install and pair Termux first.");}
  Intent run=new Intent("com.termux.RUN_COMMAND").setClassName("com.termux","com.termux.app.RunCommandService");
  run.putExtra("com.termux.RUN_COMMAND_PATH",termuxRoot+"/files/usr/bin/bash");
  run.putExtra("com.termux.RUN_COMMAND_ARGUMENTS",new String[]{termuxRoot+"/files/home/neu205-one/start-companion.sh"});
  run.putExtra("com.termux.RUN_COMMAND_WORKDIR",termuxRoot+"/files/home/neu205-one");run.putExtra("com.termux.RUN_COMMAND_BACKGROUND",true);
  try{if(startService(run)==null)throw new IOException("Termux companion not installed.");}catch(RuntimeException e){throw new IOException("Termux could not launch the isolated companion. Complete setup first.");}
 }
 private void maybeCapture(){if(!running || !voiceReady || !backendReady || recorder!=null || capturePending==generation)return;busy=false;move(ConversationState.Stage.STARTING,"Preparing microphone");long token=generation;capturePending=token;new Thread(()->capture(token),"neu205-microphone").start();}
 private void capture(long token){
  AudioRecord local=null;
  try{
   int min=AudioRecord.getMinBufferSize(16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT);
   local=new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION,16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,Math.max(min,6400));
   if(local.getState()!=AudioRecord.STATE_INITIALIZED)throw new IOException("Microphone initialization failed");
   synchronized(state){if(!live(token))return;recorder=local;lastSampleAt=SystemClock.elapsedRealtime();local.startRecording();}UtteranceSegmenter segmenter=new UtteranceSegmenter(700);boolean calibrated=false;short[] frame=new short[320];int filled=0;
   while(live(token)){
    if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)throw new IOException("Microphone permission revoked");
    int n=local.read(frame,filled,frame.length-filled,AudioRecord.READ_BLOCKING);if(n<=0)throw new IOException("Microphone stopped");lastSampleAt=SystemClock.elapsedRealtime();filled+=n;if(filled<frame.length)continue;filled=0;
    if(busy || SystemClock.elapsedRealtime()<resumeAfter){segmenter.reset();continue;}
    UtteranceSegmenter.Result result=segmenter.accept(frame);if(!calibrated && segmenter.isCalibrated()){calibrated=true;main.post(()->{if(live(token) && !busy)move(ConversationState.Stage.LISTENING,"Listening");});}
    if(result==null){if(segmenter.isEndpointing() && state.get()!=ConversationState.Stage.SPEECH_ENDING)main.post(()->{if(live(token) && !busy)move(ConversationState.Stage.SPEECH_ENDING,"Listening");});else if(!segmenter.isEndpointing() && state.get()==ConversationState.Stage.SPEECH_ENDING)main.post(()->{if(live(token) && !busy)move(ConversationState.Stage.LISTENING,"Listening");});continue;}
    if(result.tooLong){fail("Question exceeded thirty seconds. Please ask a shorter question.");break;}
    if(result.pcm!=null){busy=true;byte[] wav=wave(result.pcm);main.post(()->{if(live(token))move(ConversationState.Stage.TRANSCRIBING,"Thinking");});io.execute(()->turn(token,wav));}
   }
  }catch(Exception e){if(live(token))fail("Microphone unavailable or interrupted. Check permission, then Start.");}
  finally{if(local!=null){try{local.stop();}catch(Exception ignored){}local.release();}if(recorder==local)recorder=null;if(capturePending==token)capturePending=-1;if(running && generation!=token)main.post(this::maybeCapture);}
 }
 private void turn(long token,byte[] wav){
  HttpURLConnection c=null;String id=UUID.randomUUID().toString();requestId=id;SpeechClauses clauses=new SpeechClauses();StringBuilder full=new StringBuilder();boolean done=false;
  main.post(()->{if(live(token)){streamDone=false;spokenIds.clear();utterances=0;answer="";pages="";}});
  try{
   float[] pcm=new float[(wav.length-44)/2];ByteBuffer samples=ByteBuffer.wrap(wav,44,wav.length-44).order(ByteOrder.LITTLE_ENDIAN);for(int i=0;i<pcm.length;i++)pcm[i]=samples.getShort()/32768f;
   double energy=0;for(float sample:pcm)energy+=sample*sample;if(pcm.length<2400 || Math.sqrt(energy/pcm.length)<0.001){main.post(()->{if(live(token)){busy=false;move(ConversationState.Stage.LISTENING,"Listening");}});return;}
   synchronized(state){if(!live(token))return;asr.cancelled=false;}WhisperOnnx.Result transcription=asr.transcribe(pcm);if(!live(token) || transcription==null)return;
   String transcript=transcription.text.trim();if(transcript.length()>1000)throw new IOException("Question is too long. Please shorten it without omitting medical qualifiers.");if(transcript.isEmpty()){main.post(()->{if(live(token)){resumeAfter=SystemClock.elapsedRealtime()+300;busy=false;move(ConversationState.Stage.LISTENING,"Listening");}});return;}
   main.post(()->{if(live(token)){question=transcript;move(ConversationState.Stage.RETRIEVING,"Thinking");}});
   JSONArray previous=history.snapshot();JSONArray topics=history.topics();
   NativeBrain localBrain=brain;
   if(localBrain!=null){
    synchronized(state){if(!live(token))return;localBrain.prepare();}
    history.add("user",transcript);
    StringBuilder spoken=new StringBuilder();
    localBrain.answer(transcript,previous,topics,new NativeBrain.Output(){
     public void pages(String value){main.post(()->{if(live(token)){pages=value;move(ConversationState.Stage.QWEN_STREAMING,"Thinking");}});}
     public void text(String value){if(!live(token))return;if(spoken.length()>0)spoken.append(' ');spoken.append(value);enqueue(token,value);}
    });
    if(!live(token))return;
    if(spoken.length()==0 || spoken.length()>2000)throw new IOException("Native Qwen returned no complete bounded answer");
    history.add("assistant",spoken.toString());main.post(()->{if(live(token)){streamDone=true;finishSpeech();}});return;
   }
   JSONObject request=new JSONObject().put("request_id",id).put("utterance_text",transcript).put("corpus_sha256",corpusHash).put("conversation_topics",topics).put("history",previous);
   if(getSharedPreferences("setup",MODE_PRIVATE).getBoolean("v11_memory",false))request.put("memory_mode","v11").put("mode",getSharedPreferences("setup",MODE_PRIVATE).getBoolean("v11_exam",false)?"exam_mcq":"study").put("generation_id","android-"+token);
   byte[] body=request.toString().getBytes(StandardCharsets.UTF_8);c=LocalTransport.open("/v1/turn",key);connection=c;c.setRequestMethod("POST");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");c.setFixedLengthStreamingMode(body.length);
   try(OutputStream out=c.getOutputStream()){out.write(body);}LocalTransport.requireSuccess(c);
   if(!live(token))return;history.add("user",transcript);
   try(BufferedReader reader=new BufferedReader(new InputStreamReader(c.getInputStream(),StandardCharsets.UTF_8))){String line;
    while(live(token) && (line=readLineBounded(reader,65536))!=null){if(line.length()>65536)throw new IOException("Oversized companion response");JSONObject event=new JSONObject(line);if(!id.equals(event.optString("request_id")))throw new IOException("Stale or mismatched response rejected");String type=event.optString("type");
     if("transcript".equals(type)){String text=event.optString("text");main.post(()->{if(live(token)){question=text;move(ConversationState.Stage.RETRIEVING,"Thinking");}});}
     else if("evidence".equals(type)){String p=event.optJSONArray("source_pages")==null?"":event.getJSONArray("source_pages").toString();main.post(()->{if(live(token)){pages=p;move(ConversationState.Stage.QWEN_STREAMING,"Thinking");}});}
     else if("token".equals(type)){String text=event.optString("text");full.append(text);if(full.length()>8192)throw new IOException("Answer exceeded safe context limit");for(String clause:clauses.accept(text,false))enqueue(token,clause);}
     else if("error".equals(type))throw new IOException("Local engine: "+event.optString("code","failed"));
     else if("done".equals(type)){done=true;for(String clause:clauses.accept("",true))enqueue(token,clause);break;}
    }
   }
   if(!live(token))return;if(!done)throw new IOException("Qwen stream interrupted");
   String retained=full.toString().replaceAll("(?s)<think>.*?</think>","").trim();if(retained.length()>2000)throw new IOException("Answer exceeded conversation memory budget");history.add("assistant",retained);
   main.post(()->{if(live(token)){streamDone=true;finishSpeech();}});
  }catch(Exception e){if(live(token))fail(e instanceof IOException?Objects.toString(e.getMessage(),"Offline engine failed"):"Offline recognition or companion response failed. Retry after checking setup.");}catch(OutOfMemoryError exhausted){if(live(token))fail("Not enough memory for offline recognition. Close other apps and retry.");}
  finally{if(c!=null)c.disconnect();if(connection==c)connection=null;}
 }
 private void enqueue(long token,String clause){main.post(()->{if(!live(token))return;String id=token+":"+(++utterances);spokenIds.add(id);answer=answer.isEmpty()?clause:answer+" "+clause;move(ConversationState.Stage.SPEAKING,"Speaking");if(tts.speak(clause,TextToSpeech.QUEUE_ADD,null,id)==TextToSpeech.ERROR)fail("Offline speech playback failed.");});}
 private void finishSpeech(){if(!running || !streamDone || !spokenIds.isEmpty())return;if(utterances==0){fail("Qwen returned no speakable answer.");return;}resumeAfter=SystemClock.elapsedRealtime()+500;busy=false;move(ConversationState.Stage.LISTENING,"Listening");}
 private final Runnable watchdog=new Runnable(){public void run(){if(!running)return;
  if(SystemClock.elapsedRealtime()-lastPowerPoll>30000){lastPowerPoll=SystemClock.elapsedRealtime();PowerManager power=(PowerManager)getSystemService(POWER_SERVICE);Intent battery=registerReceiver(null,new IntentFilter(Intent.ACTION_BATTERY_CHANGED));int level=battery==null?-1:battery.getIntExtra(BatteryManager.EXTRA_LEVEL,-1),scale=battery==null?100:battery.getIntExtra(BatteryManager.EXTRA_SCALE,100);int status=battery==null?-1:battery.getIntExtra(BatteryManager.EXTRA_STATUS,-1);String issue=RuntimePolicy.failure(power.getCurrentThermalStatus(),level<0?-1:100*level/Math.max(1,scale),status==BatteryManager.BATTERY_STATUS_CHARGING || status==BatteryManager.BATTERY_STATUS_FULL);if(issue!=null){fail(issue);return;}}
  if(recorder!=null && SystemClock.elapsedRealtime()-lastSampleAt>3000){fail("Microphone stalled. Tap Start to retry.");return;}if(routeChanged && (audio.getCommunicationDevice()==null || audio.getCommunicationDevice().getType()!=AudioDeviceInfo.TYPE_BUILTIN_SPEAKER)){fail("Speaker route changed. Tap Start when ready.");return;}long elapsed=SystemClock.elapsedRealtime()-stageSince;if(state.get()!=ConversationState.Stage.LISTENING && elapsed>(state.get()==ConversationState.Stage.STARTING?180000:120000)){fail("Offline engine deadline exceeded. Tap Start to retry.");return;}main.postDelayed(this,500);}};
 private void cancelRequest(){NativeBrain local=brain;if(local!=null){local.cancel();return;}String cancelId=requestId,secret=key;if(!cancelId.isEmpty())cancelIo.execute(()->{try{HttpURLConnection cancel=LocalTransport.open("/v1/cancel",secret);cancel.setRequestMethod("POST");cancel.setDoOutput(true);cancel.setRequestProperty("Content-Type","application/json");try(OutputStream out=cancel.getOutputStream()){out.write(new JSONObject().put("request_id",cancelId).toString().getBytes(StandardCharsets.UTF_8));}cancel.getResponseCode();cancel.disconnect();}catch(Exception ignored){}});}
 private void interruptTurn(){
  if(!running || !voiceReady || !backendReady)return;
  synchronized(state){if(asr!=null)asr.cancelInference();generation=state.begin();instanceGeneration=generation;}
  cancelRequest();HttpURLConnection current=connection;if(current!=null)current.disconnect();connection=null;
  if(tts!=null)tts.stop();spokenIds.clear();streamDone=false;utterances=0;busy=true;resumeAfter=SystemClock.elapsedRealtime()+500;
  AudioRecord mic=recorder;if(mic!=null)try{mic.stop();}catch(Exception ignored){}
  detail="Starting";stageSince=SystemClock.elapsedRealtime();maybeCapture();
 }
 private void end(boolean error){
  synchronized(state){if(!running)return;running=false;loadingCancelled.set(true);if(asr!=null)asr.cancelInference();state.stop(error);}busy=true;main.removeCallbacks(watchdog);HttpURLConnection c=connection;if(c!=null)c.disconnect();connection=null;
  cancelRequest();
  AudioRecord r=recorder;if(r!=null)try{r.stop();}catch(Exception ignored){}
  if(tts!=null){tts.stop();tts.shutdown();tts=null;}spokenIds.clear();if(focus!=null)audio.abandonAudioFocusRequest(focus);
  if(routeChanged){try{if(previousCommunication!=null)audio.setCommunicationDevice(previousCommunication);else audio.clearCommunicationDevice();}catch(RuntimeException ignored){}routeChanged=false;}
  if(modeChanged){try{audio.setMode(previousMode);}catch(RuntimeException ignored){}modeChanged=false;}
  if(!error)detail="Stopped";stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();
 }
 @Override public void onDestroy(){if(thermalRegistered)try{((PowerManager)getSystemService(POWER_SERVICE)).removeThermalStatusListener(thermalListener);}catch(RuntimeException ignored){}end(false);NativeBrain old=brain;brain=null;if(old!=null)io.execute(()->{try{old.close();}catch(IOException ignored){}});io.shutdown();cancelIo.shutdown();super.onDestroy();}
 @Override public IBinder onBind(Intent i){return null;}
 static byte[] wave(byte[] pcm){ByteBuffer b=ByteBuffer.allocate(44+pcm.length).order(ByteOrder.LITTLE_ENDIAN);b.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(36+pcm.length).put("WAVEfmt ".getBytes(StandardCharsets.US_ASCII)).putInt(16).putShort((short)1).putShort((short)1).putInt(16000).putInt(32000).putShort((short)2).putShort((short)16).put("data".getBytes(StandardCharsets.US_ASCII)).putInt(pcm.length).put(pcm);return b.array();}
 static String readLineBounded(Reader in,int limit)throws IOException{StringBuilder line=new StringBuilder();int ch;while((ch=in.read())!=-1){if(ch==10)return line.toString();if(line.length()>=limit)throw new IOException("Response line limit");if(ch!=13)line.append((char)ch);}return line.length()==0?null:line.toString();}
 static String read(InputStream in,int limit)throws IOException{ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buf=new byte[2048];int n;while((n=in.read(buf))!=-1){if(out.size()+n>limit)throw new IOException("Response limit");out.write(buf,0,n);}return new String(out.toByteArray(),StandardCharsets.UTF_8);}
}
