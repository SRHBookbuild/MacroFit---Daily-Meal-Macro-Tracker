plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android { namespace = "au.com.macrofit.sync"; compileSdk = 35
 defaultConfig { applicationId = "au.com.macrofit.sync"; minSdk = 28; targetSdk = 35; versionCode = 1; versionName = "0.1" }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
 kotlinOptions { jvmTarget = "17" }
}
dependencies {
 implementation("androidx.activity:activity-ktx:1.9.3")
 implementation("androidx.health.connect:connect-client:1.1.0")
 implementation("androidx.work:work-runtime-ktx:2.10.0")
 implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
}
