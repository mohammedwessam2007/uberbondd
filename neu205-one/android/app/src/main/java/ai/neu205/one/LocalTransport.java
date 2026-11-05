package ai.neu205.one;
import java.net.*;import java.io.*;import org.json.*;
/** Endpoint is deliberately not configurable: redirects, DNS, and remote hosts are forbidden. */
final class LocalTransport {
 static final String ROOT="http://127.0.0.1:8768";
 static HttpURLConnection open(String path,String key) throws IOException {
  if(!path.matches("/v1/(health|voice|turn|cancel)"))throw new IOException("Endpoint rejected");
  if(key==null || key.length()<32 || key.contains("\n") || key.contains("\r"))throw new IOException("Pairing key required");
  HttpURLConnection c=(HttpURLConnection)new URL(ROOT+path).openConnection(Proxy.NO_PROXY);
  c.setInstanceFollowRedirects(false);c.setConnectTimeout(2500);c.setReadTimeout(95000);c.setRequestProperty("Authorization","Bearer "+key);return c;
 }
 static final class ReadinessException extends IOException {final boolean permanent;ReadinessException(String message,boolean permanent){super(message);this.permanent=permanent;}}
 static void requireSuccess(HttpURLConnection c) throws IOException {int code=c.getResponseCode();if(code==200)return;
  if(code==401)throw new ReadinessException("Pairing rejected. Save the companion pairing key in Settings.",true);
  if(code==503){try{InputStream error=c.getErrorStream();String text=error==null?"":ConversationService.read(error,8192);JSONObject body=new JSONObject(text);String blockers=body.optJSONArray("blockers")==null?"":body.getJSONArray("blockers").toString();
   if(blockers.contains("QWEN_GGUF_IDENTITY_REQUIRED"))throw new ReadinessException("Verify your actual Qwen GGUF identity and import its receipt before Start.",true);
   if(blockers.contains("CORPUS_CORRUPT"))throw new ReadinessException("Book corpus integrity failed. Reimport the verified study assets.",true);
  }catch(JSONException ignored){}throw new ReadinessException("Paired Qwen is not ready. Check companion setup and model startup.",false);}
  throw new IOException("Local service rejected request ("+code+")");
 }
}
