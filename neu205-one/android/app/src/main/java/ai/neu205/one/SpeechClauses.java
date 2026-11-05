package ai.neu205.one;
import java.util.*;
/** Incremental reasoning filter; markup can span tokens or share a token with speech. */
final class SpeechClauses {
 private final StringBuilder pending=new StringBuilder(),input=new StringBuilder();
 private boolean thinking;private int hidden;
 List<String> accept(String token,boolean end){
  input.append(token);List<String> out=new ArrayList<>();
  while(input.length()>0){
   String text=input.toString();
   if(text.startsWith("<think>")){thinking=true;input.delete(0,7);continue;}
   if(text.startsWith("</think>")){thinking=false;hidden=0;input.delete(0,8);continue;}
   if("<think>".startsWith(text) || "</think>".startsWith(text))break;
   char c=input.charAt(0);input.deleteCharAt(0);
   if(thinking){if(++hidden>32768)throw new IllegalStateException("reasoning-overflow");continue;}
   pending.append(c);
   if(pending.length()>8192)throw new IllegalStateException("sentence-too-long");
   if(".!?".indexOf(c)>=0 && (input.length()==0 || Character.isWhitespace(input.charAt(0)) || input.charAt(0)=='<')){
    String clause=pending.toString().trim();if(clause.length()>=8){out.add(clause);pending.setLength(0);}
   }
  }
  if(end){
   if(thinking || input.length()>0)throw new IllegalStateException("incomplete-reasoning-markup");
   if(!pending.toString().trim().isEmpty())out.add(pending.toString().trim());pending.setLength(0);
  }
  return out;
 }
}
