package au.com.macrofit.sync

import android.app.Activity
import android.os.Bundle
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Mass
import androidx.work.*
import kotlinx.coroutines.*
import org.json.JSONObject
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL
import java.time.*
import java.util.concurrent.TimeUnit

private const val API = "https://srkmqaprzqgvwsnzofhi.supabase.co"
private const val ANON = "sb_publishable_-27XgckckbIlYF5gCEcnJA_XKw1kvNA"
private const val PREFS = "macrofit_auth"

class MainActivity : ComponentActivity() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private lateinit var status: TextView
    private lateinit var email: EditText
    private lateinit var otp: EditText
    private val permission = registerForActivityResult(PermissionController.createRequestPermissionResultContract()) { granted ->
        status.text = if (granted.contains(HealthPermission.getWritePermission(NutritionRecord::class))) "Nutrition permission granted" else "Nutrition permission not granted"
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(36, 48, 36, 36) }
        layout.addView(TextView(this).apply { text = "MacroFit Health Sync"; textSize = 24f })
        email = EditText(this).apply { hint = "MacroFit account email"; inputType = 33 }
        otp = EditText(this).apply { hint = "Paste the sign-in link from your email"; inputType = 17 }
        status = TextView(this).apply { text = "Sign in to the same account as your MacroFit website." }
        layout.addView(email); layout.addView(otp)
        fun button(label: String, onClick: () -> Unit) {
            layout.addView(Button(this).apply { text = label; setOnClickListener { onClick() } })
        }
        fun run(label: String, task: suspend () -> String) {
            status.text = label
            scope.launch {
                status.text = try { withContext(Dispatchers.IO) { task() } } catch (e: Exception) { "Error: ${e.message}" }
            }
        }
        button("Email me a sign-in link") { run("Requesting link...") { Api.sendCode(email.text.toString()) } }
        button("Sign in with pasted link") { run("Signing in...") { Api.verify(this, email.text.toString(), otp.text.toString()) } }
        button("Grant Health Connect permission") {
            if (HealthConnectClient.getSdkStatus(this) == HealthConnectClient.SDK_AVAILABLE)
                permission.launch(setOf(HealthPermission.getWritePermission(NutritionRecord::class)))
            else status.text = "Health Connect unavailable on this device"
        }
        button("Sync Now") { run("Syncing...") { SyncEngine.sync(this) } }
        button("Enable automatic sync") {
            val work = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
            WorkManager.getInstance(this).enqueueUniquePeriodicWork("macrofit-health-sync", ExistingPeriodicWorkPolicy.KEEP, work)
            status.text = "Automatic sync scheduled; Android controls timing."
        }
        button("Disable automatic sync") {
            WorkManager.getInstance(this).cancelUniqueWork("macrofit-health-sync")
            status.text = "Automatic sync disabled."
        }
        layout.addView(status)
        setContentView(ScrollView(this).apply { addView(layout) })
    }
    override fun onDestroy() { scope.cancel(); super.onDestroy() }
}
class PermissionsRationaleActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        android.app.AlertDialog.Builder(this).setTitle("Health Connect nutrition permission")
            .setMessage("MacroFit Health Sync reads your authorised MacroFit cloud journal and writes nutrition records to Health Connect. Revoke access in Health Connect settings.")
            .setPositiveButton("OK") { _, _ -> finish() }.setOnCancelListener { finish() }.show()
    }
}
object Api {
    private fun request(method: String, path: String, body: JSONObject? = null, token: String? = null): String {
        val c = (URL(API + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method; connectTimeout = 12000; readTimeout = 12000
            setRequestProperty("apikey", ANON)
            setRequestProperty("Content-Type", "application/json")
            if (token != null) setRequestProperty("Authorization", "Bearer $token")
            if (body != null) { doOutput = true; outputStream.use { it.write(body.toString().toByteArray()) } }
        }
        val code = c.responseCode
        val result = (if (code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
        c.disconnect()
        if (code !in 200..299) error("Server returned HTTP $code: ${result.take(150)}")
        return result
    }
    fun sendCode(email: String): String {
        require(email.contains("@")) { "Enter a valid email" }
        request("POST", "/auth/v1/otp", JSONObject().put("email", email).put("create_user", false))
        return "Email sent. Long-press the Sign in button in the email, copy its link (do not open it), and paste the link above."
    }
    fun verify(context: android.content.Context, email: String, code: String): String {
        // Outlook/Hotmail Safe Links wrap the original Supabase URL in a url= parameter.
        // Decode locally; never send a one-time sign-in URL to an external decoder.
        var link = code.trim()
        repeat(3) {
            val wrapped = android.net.Uri.parse(link)
            if (wrapped.scheme == "https" && wrapped.host?.lowercase()?.endsWith(".safelinks.protection.outlook.com") == true) {
                link = wrapped.getQueryParameter("url") ?: error("Microsoft Safe Link is missing its original URL")
            }
        }
        val uri = android.net.Uri.parse(link)
        require(uri.scheme == "https" && uri.host == "srkmqaprzqgvwsnzofhi.supabase.co" && uri.path == "/auth/v1/verify") { "Paste the original Supabase sign-in link or its Microsoft Safe Links wrapper." }
        val type = uri.getQueryParameter("type") ?: "magiclink"
        require(type == "magiclink" || type == "email") { "Unexpected sign-in link type" }
        val hash = uri.getQueryParameter("token_hash")
        val result = if (hash != null) {
            JSONObject(request("POST", "/auth/v1/verify", JSONObject().put("token_hash", hash).put("type", type)))
        } else {
            // Magic-link emails commonly contain token= rather than token_hash=.
            // GET the original verify URL without following the redirect to the website.
            require(uri.getQueryParameter("token") != null) { "Sign-in link has no token" }
            val conn = (URL(link).openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = false
                connectTimeout = 12000; readTimeout = 12000
                setRequestProperty("apikey", ANON)
            }
            try {
                val location = conn.getHeaderField("Location")
                require(conn.responseCode in 300..399 && !location.isNullOrBlank()) { "Supabase could not verify this link (it may be expired or already used)." }
                val redirect = android.net.Uri.parse(location)
                val fragment = redirect.encodedFragment ?: ""
                val fragmentUri = android.net.Uri.parse("https://local.invalid/?$fragment")
                val refresh = fragmentUri.getQueryParameter("refresh_token")
                require(!refresh.isNullOrBlank()) { "Verification did not return a session. Request a fresh sign-in email." }
                JSONObject().put("refresh_token", refresh)
            } finally { conn.disconnect() }
        }
        context.getSharedPreferences(PREFS, 0).edit().putString("refresh", result.getString("refresh_token")).apply()
        return "Signed in."
    }
    fun journal(context: android.content.Context): JSONObject {
        val p = context.getSharedPreferences(PREFS, 0)
        val refresh = p.getString("refresh", null) ?: error("Sign in first")
        val auth = JSONObject(request("POST", "/auth/v1/token?grant_type=refresh_token", JSONObject().put("refresh_token", refresh)))
        p.edit().putString("refresh", auth.getString("refresh_token")).apply()
        val rows = JSONArray(request("GET", "/rest/v1/macrofit_journals?select=journal&limit=1", token = auth.getString("access_token")))
        require(rows.length() > 0) { "No cloud journal. Sync MacroFit website first." }
        return rows.getJSONObject(0).getJSONObject("journal")
    }
}
object SyncEngine {
    suspend fun sync(context: android.content.Context): String {
        require(HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE) { "Health Connect unavailable" }
        val client = HealthConnectClient.getOrCreate(context)
        require(client.permissionController.getGrantedPermissions().contains(HealthPermission.getWritePermission(NutritionRecord::class))) { "Grant nutrition permission first" }
        val days = Api.journal(context).getJSONObject("days")
        val zone = ZoneId.systemDefault()
        var count = 0
        for (date in days.keys()) {
            val day = days.optJSONObject(date) ?: continue
            val parsed = try { LocalDate.parse(date) } catch (_: Exception) { continue }
            for ((index, meal) in listOf("breakfast", "lunch", "dinner", "snack").withIndex()) {
                val items = day.optJSONArray(meal) ?: continue
                for (i in 0 until items.length()) {
                    val item = items.optJSONObject(i) ?: continue
                    val calories = item.optDouble("calories", Double.NaN)
                    if (!calories.isFinite() || calories <= 0) continue
                    val start = parsed.atTime(8 + index * 4, 0).atZone(zone).toInstant().plusSeconds(i.toLong() * 60)
                    fun grams(key: String) = Mass.grams(item.optDouble(key, 0.0).coerceAtLeast(0.0))
                    val record = NutritionRecord(
                        startTime = start, endTime = start.plusSeconds(60),
                        startZoneOffset = zone.rules.getOffset(start), endZoneOffset = zone.rules.getOffset(start),
                        name = item.optString("name", "MacroFit food"),
                        mealType = when (meal) {
                            "breakfast" -> 1
                            "lunch" -> 2
                            "dinner" -> 3
                            else -> 4
                        },
                        energy = Energy.kilocalories(calories),
                        protein = grams("protein"), totalCarbohydrate = grams("carbs"), totalFat = grams("fat"),
                        sugar = grams("sugar"), saturatedFat = grams("satFat"),
                        sodium = Mass.grams(item.optDouble("sodium", 0.0).coerceAtLeast(0.0) / 1000.0),
                        metadata = Metadata.manualEntry(clientRecordId = "macrofit-$date-$meal-$i", clientRecordVersion = item.toString().hashCode().toLong().and(0xffffffffL))
                    )
                    client.insertRecords(listOf(record))
                    count++
                }
            }
        }
        return "Sent $count food records to Health Connect. Verify in Samsung Health."
    }
}
class SyncWorker(context: android.content.Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result = try { SyncEngine.sync(applicationContext); Result.success() }
    catch (_: Exception) { Result.retry() }
}
