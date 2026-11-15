package ai.neu205.one;
import android.Manifest;import android.content.*;import android.media.AudioManager;import android.os.Looper;import org.junit.Test;import org.junit.runner.RunWith;import org.robolectric.*;import org.robolectric.annotation.Config;import static org.junit.Assert.*;
@RunWith(RobolectricTestRunner.class) @Config(sdk=35)
public class ServiceRoutingTest {
 @Test public void stopOrStartupFailureRestoresPreviousAudioMode(){
  var controller=Robolectric.buildService(ConversationService.class).create();ConversationService service=controller.get();AudioManager manager=(AudioManager)service.getSystemService(Context.AUDIO_SERVICE);manager.setMode(AudioManager.MODE_NORMAL);
  service.getSharedPreferences("setup",Context.MODE_PRIVATE).edit().putString("key","x".repeat(32)).commit();Shadows.shadowOf(service.getApplication()).grantPermissions(Manifest.permission.RECORD_AUDIO);
  service.onStartCommand(new Intent(service,ConversationService.class).setAction("START"),0,1);
  assertEquals("Visible startup owns communication mode before Stop",AudioManager.MODE_IN_COMMUNICATION,manager.getMode());
  service.onStartCommand(new Intent(service,ConversationService.class).setAction("STOP"),0,2);Shadows.shadowOf(Looper.getMainLooper()).idle();
  assertEquals(AudioManager.MODE_NORMAL,manager.getMode());assertFalse(ConversationService.active());controller.destroy();
 }
}
