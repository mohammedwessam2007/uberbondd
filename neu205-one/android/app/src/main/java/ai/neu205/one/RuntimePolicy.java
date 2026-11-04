package ai.neu205.one;
/** Conservative runtime exit policy; does not change system battery/thermal settings. */
final class RuntimePolicy {
 static String failure(int thermalStatus,int batteryPercent,boolean charging){if(thermalStatus>=3)return "Device temperature is too high. Let it cool before Start.";if(batteryPercent>=0 && batteryPercent<=5 && !charging)return "Battery is critically low. Charge the phone before Start.";return null;}
}
