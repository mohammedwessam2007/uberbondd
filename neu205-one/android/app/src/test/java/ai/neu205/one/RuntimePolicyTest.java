package ai.neu205.one;
import org.junit.Test;import static org.junit.Assert.*;
public class RuntimePolicyTest {
 @Test public void severeThermalStopsEvenWhenCharging(){assertNotNull(RuntimePolicy.failure(3,80,true));assertNotNull(RuntimePolicy.failure(6,100,true));}
 @Test public void criticalBatteryStopsOnlyWhenNotCharging(){assertNotNull(RuntimePolicy.failure(0,5,false));assertNull(RuntimePolicy.failure(0,5,true));assertNull(RuntimePolicy.failure(0,-1,false));}
 @Test public void ordinaryWarmOperationContinues(){assertNull(RuntimePolicy.failure(2,50,false));}
}
