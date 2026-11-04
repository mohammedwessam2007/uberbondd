package ai.neu205.one;
import org.junit.Test;import static org.junit.Assert.*;import java.io.*;import java.net.*;
public class LocalTransportTest {
 @Test public void transportCannotAcceptRemoteHostOrRedirects()throws Exception{for(String p:new String[]{"https://example.com","//example.com","/v1/health?redirect=x","/v1/../voice"}){try{LocalTransport.open(p,"x".repeat(32));fail(p);}catch(IOException expected){}}HttpURLConnection c=LocalTransport.open("/v1/health","x".repeat(32));assertFalse(c.getInstanceFollowRedirects());assertEquals("127.0.0.1",c.getURL().getHost());assertEquals(8768,c.getURL().getPort());c.disconnect();}
 @Test public void rejectsHeaderInjection()throws Exception{try{LocalTransport.open("/v1/health","x".repeat(32)+"\r\nX:test");fail();}catch(IOException expected){}}
}
