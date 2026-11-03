-keep class com.supertable.app.MainActivity { *; }
-keep class com.supertable.app.WebLoginActivity { *; }
-keep class com.supertable.app.Bridge { *; }
-keep class com.supertable.app.ReminderReceiver { *; }
-keep class com.supertable.app.BootReceiver { *; }
-keepattributes *Annotation*
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-dontwarn **
