# Правила R8 для release-сборки (#55, M-4).
#
# Flutter-часть приложения R8 не трогает, но плагины и нативные модели могут
# ломаться при переименовании. Здесь — минимальный набор исключений.

# flutter_secure_storage: доступ к Keystore/SharedPreferences по именам.
-keep class com.it_nomads.fluttersecurestorage.** { *; }

# Плагины с MethodChannel: имена методов и классов должны сохраняться.
-keep class io.flutter.plugin.** { *; }
-keep class io.flutter.util.** { *; }
-keep class io.flutter.app.** { *; }
-keep class io.flutter.view.** { *; }

# Модели с рефлексией (json_serializable и подобные) — сохраняем поля.
-keepattributes Signature
-keepattributes *Annotation*
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

# Отладочная информация не нужна в релизе.
-dontwarn org.jetbrains.annotations.**
