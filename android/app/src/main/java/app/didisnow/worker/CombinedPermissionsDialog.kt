package app.didisnow.worker

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.text.SpannableString
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.RelativeSizeSpan
import android.text.style.StyleSpan
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AlertDialog

object CombinedPermissionsDialog {
    
    /**
     * Show a combined dialog for all app permissions
     */
    fun showPermissionsDialog(activity: Activity) {
        // Create custom view for the dialog content
        val container = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(60, 40, 60, 40)
            gravity = Gravity.START
        }
        
        // Add permission items
        container.addView(createPermissionItem(
            activity,
            "📱",
            "Display Over Other Apps",
            "Required to show booking alerts even when the app is minimized or in the background."
        ))
        
        container.addView(createPermissionItem(
            activity,
            "🔔",
            "Notification Permission",
            "Allows you to receive real-time booking notifications."
        ))
        
        container.addView(createPermissionItem(
            activity,
            "✅",
            "Battery Optimization",
            "Enable this to prevent the app from being killed in the background, ensuring you don't miss any bookings."
        ))
        
        // Create and show dialog
        val dialog = AlertDialog.Builder(activity)
            .setView(container)
            .setPositiveButton("ALLOW") { _, _ ->
                // Request all permissions
                requestAllPermissions(activity)
            }
            .setNegativeButton("LATER") { dialog, _ ->
                dialog.dismiss()
            }
            .setCancelable(false)
            .create()
        
        dialog.show()
        
        // Style buttons
        dialog.getButton(AlertDialog.BUTTON_POSITIVE)?.apply {
            setTextColor(Color.parseColor("#4CAF50")) // Green
            textSize = 16f
            isAllCaps = true
        }
        dialog.getButton(AlertDialog.BUTTON_NEGATIVE)?.apply {
            setTextColor(Color.parseColor("#757575")) // Gray
            textSize = 16f
            isAllCaps = true
        }
    }
    
    /**
     * Create a single permission item view
     */
    private fun createPermissionItem(
        activity: Activity,
        emoji: String,
        title: String,
        description: String
    ): LinearLayout {
        val itemContainer = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 0, 0, 40)
            gravity = Gravity.START
        }
        
        // Emoji icon
        val emojiText = TextView(activity).apply {
            text = emoji
            textSize = 32f
            setPadding(0, 0, 30, 0)
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }
        
        // Text container (title + description)
        val textContainer = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                0,
                LinearLayout.LayoutParams.WRAP_CONTENT,
                1f
            )
        }
        
        // Title
        val titleText = TextView(activity).apply {
            text = title
            textSize = 16f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.parseColor("#ff007a")) // Pink
            setPadding(0, 0, 0, 8)
        }
        
        // Description
        val descriptionText = TextView(activity).apply {
            text = description
            textSize = 14f
            setTextColor(Color.parseColor("#333333")) // Dark gray
            lineHeight = (textSize * 1.4f).toInt()
        }
        
        textContainer.addView(titleText)
        textContainer.addView(descriptionText)
        
        itemContainer.addView(emojiText)
        itemContainer.addView(textContainer)
        
        return itemContainer
    }
    
    /**
     * Request all permissions in sequence
     */
    private fun requestAllPermissions(activity: Activity) {
        // Request overlay permission first
        OverlayPermissionHelper.request(activity)
        
        // Request notification permission after a delay
        android.os.Handler(activity.mainLooper).postDelayed({
            PermissionHelper.requestNotificationPermissionWithRationale(activity)
        }, 1000)
        
        // Request battery optimization exemption last
        android.os.Handler(activity.mainLooper).postDelayed({
            BatteryOptimizationHelper.requestIgnoreBatteryOptimizations(activity)
        }, 2000)
    }
}
