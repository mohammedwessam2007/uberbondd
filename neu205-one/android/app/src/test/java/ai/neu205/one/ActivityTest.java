package ai.neu205.one;
import org.junit.Test;import org.junit.runner.RunWith;import org.robolectric.*;import org.robolectric.annotation.Config;import android.Manifest;import android.content.pm.PackageManager;import android.widget.Button;import static org.junit.Assert.*;
@RunWith(RobolectricTestRunner.class) @Config(sdk=35)
public class ActivityTest {
 @Test public void firstLaunchNeverStartsMicOrRequestsPermission(){MainActivity a=Robolectric.buildActivity(MainActivity.class).setup().get();assertFalse(ConversationService.active());assertEquals(PackageManager.PERMISSION_DENIED,a.checkSelfPermission(Manifest.permission.RECORD_AUDIO));}
 @Test public void rotationDoesNotStartSession(){var c=Robolectric.buildActivity(MainActivity.class).setup();c.configurationChange();assertFalse(ConversationService.active());}
}
