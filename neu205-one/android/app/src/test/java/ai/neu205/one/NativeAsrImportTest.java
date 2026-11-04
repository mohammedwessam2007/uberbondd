package ai.neu205.one;
import java.io.*;import java.lang.reflect.*;import java.nio.file.*;import org.junit.*;import org.junit.runner.RunWith;import org.robolectric.*;import org.robolectric.annotation.Config;import static org.junit.Assert.*;
@RunWith(RobolectricTestRunner.class) @Config(sdk=35)
public class NativeAsrImportTest {
 @Test public void rejectedReplacementPreservesExistingBytes()throws Exception{
  File dir=Files.createTempDirectory("asr-rollback").toFile(),original=new File(dir,"tokens.txt");byte[] old="preserved original fixture".getBytes("UTF-8");Files.write(original.toPath(),old);
  Method install=NativeAsr.class.getDeclaredMethod("install",android.content.Context.class,File.class,String.class,String.class);install.setAccessible(true);
  try{install.invoke(null,RuntimeEnvironment.getApplication(),dir,"tokens.txt","0".repeat(64));fail();}catch(InvocationTargetException rejected){assertTrue(rejected.getCause() instanceof IOException);}
  assertArrayEquals(old,Files.readAllBytes(original.toPath()));assertFalse(new File(dir,"tokens.txt.partial").exists());
 }
 @Test public void interruptedExtractionPreservesExistingBytes()throws Exception{
  File dir=Files.createTempDirectory("asr-cancel").toFile(),original=new File(dir,"tokens.txt");byte[] old={1,2,3};Files.write(original.toPath(),old);
  Method install=NativeAsr.class.getDeclaredMethod("install",android.content.Context.class,File.class,String.class,String.class);install.setAccessible(true);Thread.currentThread().interrupt();
  try{install.invoke(null,RuntimeEnvironment.getApplication(),dir,"tokens.txt","0".repeat(64));fail();}catch(InvocationTargetException rejected){assertTrue(rejected.getCause() instanceof InterruptedIOException);}finally{Thread.interrupted();}
  assertArrayEquals(old,Files.readAllBytes(original.toPath()));assertFalse(new File(dir,"tokens.txt.partial").exists());
 }
}
