package ai.neu205.one;
import java.util.*;import org.json.*;
/** Six bounded history messages matches the frozen companion contract. Never persistent. */
final class TurnMemory {
 private final ArrayDeque<JSONObject> items=new ArrayDeque<>();
 synchronized void clear(){items.clear();}
 synchronized void add(String role,String text)throws JSONException {if(!role.equals("user") && !role.equals("assistant"))throw new IllegalArgumentException("role");if(text.length()>2000)throw new IllegalArgumentException("history-too-long");items.addLast(new JSONObject().put("role",role).put("content",text));while(items.size()>6)items.removeFirst();}
 synchronized JSONArray snapshot(){JSONArray out=new JSONArray();for(JSONObject item:items)out.put(item);return out;}
 synchronized JSONArray topics(){JSONArray out=new JSONArray();for(JSONObject item:items)if(item.optString("role").equals("user")){String text=item.optString("content");out.put(text.substring(0,Math.min(200,text.length())));}return out;}
}
