package com.saathi.screencapture

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.pm.ServiceInfo
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import android.util.Base64
import android.util.DisplayMetrics
import android.view.WindowManager
import java.io.ByteArrayOutputStream

class ScreenCaptureService : Service() {
  private var projection: MediaProjection? = null
  private var display: VirtualDisplay? = null
  private var reader: ImageReader? = null
  private var lastFrameAt = 0L
  private val projectionCallback = object : MediaProjection.Callback() {
    override fun onStop() { stopCapture() }
  }

  override fun onCreate() {
    super.onCreate()
    createChannel()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
    } else {
      startForeground(NOTIFICATION_ID, notification())
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) { stopCapture(); return START_NOT_STICKY }
    val resultCode = intent?.getIntExtra(RESULT_CODE, 0) ?: 0
    @Suppress("DEPRECATION")
    val data = if (Build.VERSION.SDK_INT >= 33) intent?.getParcelableExtra(RESULT_DATA, Intent::class.java) else intent?.getParcelableExtra<Intent>(RESULT_DATA)
    if (resultCode == 0 || data == null || projection != null) { stopCapture(); return START_NOT_STICKY }
    val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    projection = manager.getMediaProjection(resultCode, data).also { it.registerCallback(projectionCallback, null) }
    val metrics = DisplayMetrics()
    @Suppress("DEPRECATION")
    val windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    @Suppress("DEPRECATION")
    windowManager.defaultDisplay.getRealMetrics(metrics)
    val width = 480
    val height = (width * metrics.heightPixels.toFloat() / metrics.widthPixels.coerceAtLeast(1)).toInt().coerceIn(640, 1200)
    reader = ImageReader.newInstance(width, height, android.graphics.PixelFormat.RGBA_8888, 2).also { imageReader ->
      imageReader.setOnImageAvailableListener({ source ->
        val now = System.currentTimeMillis()
        if (now - lastFrameAt < 1200) { source.acquireLatestImage()?.close(); return@setOnImageAvailableListener }
        val image = source.acquireLatestImage() ?: return@setOnImageAvailableListener
        try {
          val plane = image.planes[0]
          val pixelStride = plane.pixelStride
          val rowPadding = plane.rowStride - pixelStride * image.width
          val paddedWidth = image.width + rowPadding / pixelStride
          val padded = Bitmap.createBitmap(paddedWidth, image.height, Bitmap.Config.ARGB_8888)
          padded.copyPixelsFromBuffer(plane.buffer)
          val frame = Bitmap.createBitmap(padded, 0, 0, image.width, image.height)
          padded.recycle()
          val bytes = ByteArrayOutputStream()
          frame.compress(Bitmap.CompressFormat.JPEG, 38, bytes)
          frame.recycle()
          ScreenCaptureModule.emit("onScreenCaptureFrame", mapOf("jpegBase64" to Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP), "capturedAt" to now))
          lastFrameAt = now
        } catch (_: Exception) {
          // Frames are ephemeral; a bad frame is dropped without stopping capture.
        } finally { image.close() }
      }, null)
    }
    display = projection?.createVirtualDisplay("Saathi guidance", width, height, metrics.densityDpi, DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader?.surface, null, null)
    return START_NOT_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    stopCapture()
    super.onDestroy()
  }

  private fun stopCapture() {
    display?.release(); display = null
    reader?.setOnImageAvailableListener(null, null); reader?.close(); reader = null
    val active = projection; projection = null
    if (active != null) { try { active.unregisterCallback(projectionCallback); active.stop() } catch (_: Exception) { } }
    ScreenCaptureModule.emit("onScreenCaptureStopped", emptyMap())
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(CHANNEL_ID, "Saathi screen sharing", NotificationManager.IMPORTANCE_LOW)
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
  }

  private fun notification(): Notification {
    val stop = PendingIntent.getService(this, 0, Intent(this, ScreenCaptureService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL_ID) else Notification.Builder(this)
    return builder.setContentTitle("Saathi screen sharing is on")
      .setContentText("Your family can see your screen. Tap Stop to end sharing.")
      .setSmallIcon(android.R.drawable.ic_menu_view)
      .setOngoing(true)
      .addAction(Notification.Action.Builder(android.R.drawable.ic_media_pause, "Stop sharing", stop).build())
      .build()
  }

  companion object {
    const val RESULT_CODE = "capture_result_code"
    const val RESULT_DATA = "capture_result_data"
    private const val ACTION_STOP = "com.saathi.screencapture.STOP"
    private const val CHANNEL_ID = "saathi-screen-sharing"
    private const val NOTIFICATION_ID = 7043
  }
}
