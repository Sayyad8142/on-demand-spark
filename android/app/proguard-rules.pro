# Capacitor plugins
-keep class com.getcapacitor.** { *; }
-keep class app.didisnow.worker.OverlayAuthPlugin { *; }
-keep class app.didisnow.worker.OverlayPlugin { *; }
-keep class app.didisnow.worker.AuthBridge { *; }
-keep class app.didisnow.worker.ForegroundServicePlugin { *; }

# Keep all plugin methods
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.annotation.PluginMethod public *;
}
