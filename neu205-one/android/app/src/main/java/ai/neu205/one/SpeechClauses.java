package ai.neu205.one;
import java.util.*;
/** Only completed sentences are released; never expose model reasoning markup. */
final class SpeechClauses {
 private final StringBuilder pending=new StringBuilder(); private boolean thinking;
 List<String> accept(String token,boolean end){
  pending.append(token);String all=pending.toString();
  if(all.contains("<think>"))thinking=true;
  if(thinking){int close=all.indexOf("</think>");if(close<0){if(pending.length()>32768)throw new IllegalStateException("reasoning-overflow");return List.of();}pending.delete(0,close+8);thinking=false;}
  List<String> out=new ArrayList<>();int start=0;
  for(int i=0;i<pending.length();i++)if(".!?".indexOf(pending.charAt(i))>=0 && (i+1==pending.length() || Character.isWhitespace(pending.charAt(i+1)))){
   String clause=pending.substring(start,i+1).trim();if(clause.length()>=8){out.add(clause);start=i+1;}
  }
  if(start>0)pending.delete(0,start);
  if(end && !pending.toString().trim().isEmpty()){out.add(pending.toString().trim());pending.setLength(0);}
  if(pending.length()>8192)throw new IllegalStateException("sentence-too-long");return out;
 }
}
