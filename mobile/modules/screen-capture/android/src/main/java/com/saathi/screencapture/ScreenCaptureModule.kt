package com.saathi.screencapture

import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjectionManager
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.ActivityEventListener
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

class ScreenCaptureModule : Module() {
  private var pending: Promise? = null
  private val listener = object : ActivityEventListener {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != REQUEST_CODE) return
      val promise = pending
      pending = null
      if (resultCode != Activity.RESULT_OK || data == null) {
        promise?.resolve(false)
        return
      }
      val service = Intent(activity, ScreenCaptureService::class.java)
        .putExtra(ScreenCaptureService.RESULT_CODE, resultCode)
        .putExtra(ScreenCaptureService.RESULT_DATA, data)
      ContextCompat.startForegroundService(activity, service)
      promise?.resolve(true)
    }

    override fun onNewIntent(intent: Intent) = Unit
  }

  override fun definition() = ModuleDefinition {
    Name("SaathiScreenCapture")
    Events("onScreenCaptureFrame", "onScreenCaptureStopped")
    OnCreate {
      eventEmitter = { name, payload -> sendEvent(name, payload) }
      appContext.reactContext?.addActivityEventListener(listener)
    }
    OnDestroy { appContext.reactContext?.removeActivityEventListener(listener); eventEmitter = null; pending = null }
    AsyncFunction("requestAndStart") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) { promise.reject("NO_ACTIVITY", "Saathi needs an active screen to request permission", null); return@AsyncFunction }
      if (pending != null) { promise.reject("REQUEST_IN_PROGRESS", "A screen permission request is already open", null); return@AsyncFunction }
      pending = promise
      val manager = activity.getSystemService(Activity.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
      activity.startActivityForResult(manager.createScreenCaptureIntent(), REQUEST_CODE)
    }
    AsyncFunction("stop") {
      appContext.reactContext?.stopService(Intent(appContext.reactContext, ScreenCaptureService::class.java))
      true
    }
  }

  companion object {
    const val REQUEST_CODE = 7042
    @Volatile var eventEmitter: ((String, Map<String, Any?>) -> Unit)? = null
    fun emit(name: String, payload: Map<String, Any?>) { eventEmitter?.invoke(name, payload) }
  }
}
