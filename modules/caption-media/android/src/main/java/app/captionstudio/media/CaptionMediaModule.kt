package app.captionstudio.media

import android.content.Context
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteOrder

class CaptionMediaModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CaptionMedia")

    AsyncFunction("getMediaInfo") { inputUri: String ->
      val context = requireContext()
      val uri = Uri.parse(inputUri)
      val retriever = MediaMetadataRetriever()
      try {
        retriever.setDataSource(context, uri)
        val durationMs = retriever
          .extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
          ?.toLongOrNull() ?: 0L
        val width = retriever
          .extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)
          ?.toIntOrNull() ?: 0
        val height = retriever
          .extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)
          ?.toIntOrNull() ?: 0
        val rotation = retriever
          .extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)
          ?.toIntOrNull() ?: 0

        mapOf(
          "durationMs" to durationMs,
          "width" to width,
          "height" to height,
          "rotation" to rotation,
          "hasAudio" to hasAudioTrack(context, uri)
        )
      } finally {
        retriever.release()
      }
    }

    AsyncFunction("extractAudioToWav") { inputUri: String, outputUri: String ->
      extractAudioToWav(Uri.parse(inputUri), Uri.parse(outputUri))
    }
  }

  private fun requireContext(): Context =
    appContext.reactContext ?: throw IllegalStateException("React context is unavailable")

  private fun hasAudioTrack(context: Context, uri: Uri): Boolean {
    val extractor = MediaExtractor()
    return try {
      extractor.setDataSource(context, uri, null)
      (0 until extractor.trackCount).any { index ->
        extractor.getTrackFormat(index)
          .getString(MediaFormat.KEY_MIME)
          ?.startsWith("audio/") == true
      }
    } finally {
      extractor.release()
    }
  }

  private fun extractAudioToWav(inputUri: Uri, outputUri: Uri): Map<String, Any> {
    val context = requireContext()
    val outputPath = outputUri.path
      ?: throw IllegalArgumentException("Output URI must be a writable file URI")
    val outputFile = File(outputPath)
    outputFile.parentFile?.mkdirs()

    val extractor = MediaExtractor()
    var codec: MediaCodec? = null
    var output: RandomAccessFile? = null

    try {
      extractor.setDataSource(context, inputUri, null)
      val trackIndex = (0 until extractor.trackCount).firstOrNull { index ->
        extractor.getTrackFormat(index)
          .getString(MediaFormat.KEY_MIME)
          ?.startsWith("audio/") == true
      } ?: throw IllegalArgumentException("The selected video has no audio track")

      extractor.selectTrack(trackIndex)
      val sourceFormat = extractor.getTrackFormat(trackIndex)
      val mime = sourceFormat.getString(MediaFormat.KEY_MIME)
        ?: throw IllegalStateException("Audio track has no MIME type")
      val durationUs = if (sourceFormat.containsKey(MediaFormat.KEY_DURATION)) {
        sourceFormat.getLong(MediaFormat.KEY_DURATION)
      } else {
        0L
      }

      sourceFormat.setInteger(MediaFormat.KEY_PCM_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
      codec = MediaCodec.createDecoderByType(mime)
      codec.configure(sourceFormat, null, null, 0)
      codec.start()

      output = RandomAccessFile(outputFile, "rw")
      output.setLength(0)
      output.write(ByteArray(WAV_HEADER_SIZE))

      val bufferInfo = MediaCodec.BufferInfo()
      var inputDone = false
      var outputDone = false
      var sampleRate = sourceFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      var channelCount = sourceFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
      var pcmBytes = 0L
      var writtenFrames = 0L
      var insertedSilenceFrames = 0L
      var trimmedOverlapFrames = 0L

      while (!outputDone) {
        if (!inputDone) {
          val inputIndex = codec.dequeueInputBuffer(CODEC_TIMEOUT_US)
          if (inputIndex >= 0) {
            val inputBuffer = codec.getInputBuffer(inputIndex)
              ?: throw IllegalStateException("Decoder input buffer is unavailable")
            val sampleSize = extractor.readSampleData(inputBuffer, 0)
            if (sampleSize < 0) {
              codec.queueInputBuffer(
                inputIndex,
                0,
                0,
                0,
                MediaCodec.BUFFER_FLAG_END_OF_STREAM
              )
              inputDone = true
            } else {
              codec.queueInputBuffer(
                inputIndex,
                0,
                sampleSize,
                extractor.sampleTime,
                0
              )
              extractor.advance()
            }
          }
        }

        when (val outputIndex = codec.dequeueOutputBuffer(bufferInfo, CODEC_TIMEOUT_US)) {
          MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
            val decodedFormat = codec.outputFormat
            val decodedSampleRate = decodedFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            val decodedChannelCount = decodedFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
            if (pcmBytes > 0L &&
              (decodedSampleRate != sampleRate || decodedChannelCount != channelCount)
            ) {
              throw IllegalStateException("Decoder changed PCM format after audio output started")
            }
            sampleRate = decodedSampleRate
            channelCount = decodedChannelCount
            val encoding = if (decodedFormat.containsKey(MediaFormat.KEY_PCM_ENCODING)) {
              decodedFormat.getInteger(MediaFormat.KEY_PCM_ENCODING)
            } else {
              AudioFormat.ENCODING_PCM_16BIT
            }
            if (encoding != AudioFormat.ENCODING_PCM_16BIT) {
              throw IllegalStateException("Unsupported decoder PCM encoding: $encoding")
            }
          }

          MediaCodec.INFO_TRY_AGAIN_LATER,
          MediaCodec.INFO_OUTPUT_BUFFERS_CHANGED -> Unit

          else -> if (outputIndex >= 0) {
            val isDecodedAudio = bufferInfo.size > 0 &&
              bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0 &&
              bufferInfo.flags and MediaCodec.BUFFER_FLAG_DECODE_ONLY == 0
            if (isDecodedAudio) {
              val decoded = codec.getOutputBuffer(outputIndex)
                ?: throw IllegalStateException("Decoder output buffer is unavailable")
              decoded.order(ByteOrder.LITTLE_ENDIAN)
              decoded.position(bufferInfo.offset)
              decoded.limit(bufferInfo.offset + bufferInfo.size)
              val bytes = ByteArray(bufferInfo.size)
              decoded.get(bytes)

              val bytesPerFrame = channelCount * PCM_BYTES_PER_SAMPLE
              val bufferFrameCount = bytes.size / bytesPerFrame
              val targetFrame = presentationTimeToFrame(
                bufferInfo.presentationTimeUs,
                sampleRate
              )
              val frameDelta = targetFrame - writtenFrames

              if (frameDelta > 0L) {
                writeSilence(output, frameDelta * bytesPerFrame)
                writtenFrames += frameDelta
                insertedSilenceFrames += frameDelta
                pcmBytes += frameDelta * bytesPerFrame
              }

              val framesToSkip = if (frameDelta < 0L) {
                (-frameDelta).coerceAtMost(bufferFrameCount.toLong())
              } else {
                0L
              }
              val byteOffset = (framesToSkip * bytesPerFrame).toInt()
              val writableBytes = (bufferFrameCount * bytesPerFrame) - byteOffset
              if (writableBytes > 0) {
                output.write(bytes, byteOffset, writableBytes)
                val framesWritten = writableBytes / bytesPerFrame
                writtenFrames += framesWritten
                pcmBytes += writableBytes
              }
              trimmedOverlapFrames += framesToSkip
            }
            outputDone = bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
            codec.releaseOutputBuffer(outputIndex, false)
          }
        }
      }

      output.seek(0)
      writeWavHeader(output, pcmBytes, sampleRate, channelCount)

      return mapOf(
        "outputUri" to outputUri.toString(),
        "sampleRate" to sampleRate,
        "channelCount" to channelCount,
        "durationMs" to durationUs / 1000L,
        "pcmBytes" to pcmBytes,
        "insertedSilenceMs" to framesToMilliseconds(insertedSilenceFrames, sampleRate),
        "trimmedOverlapMs" to framesToMilliseconds(trimmedOverlapFrames, sampleRate)
      )
    } finally {
      output?.close()
      codec?.let { currentCodec ->
        runCatching { currentCodec.stop() }
        runCatching { currentCodec.release() }
      }
      extractor.release()
    }
  }

  private fun writeWavHeader(
    output: RandomAccessFile,
    pcmBytes: Long,
    sampleRate: Int,
    channelCount: Int
  ) {
    val bitsPerSample = 16
    val byteRate = sampleRate * channelCount * bitsPerSample / 8
    val blockAlign = channelCount * bitsPerSample / 8

    output.writeBytes("RIFF")
    writeLittleEndianInt(output, (pcmBytes + 36L).coerceAtMost(Int.MAX_VALUE.toLong()).toInt())
    output.writeBytes("WAVE")
    output.writeBytes("fmt ")
    writeLittleEndianInt(output, 16)
    writeLittleEndianShort(output, 1)
    writeLittleEndianShort(output, channelCount)
    writeLittleEndianInt(output, sampleRate)
    writeLittleEndianInt(output, byteRate)
    writeLittleEndianShort(output, blockAlign)
    writeLittleEndianShort(output, bitsPerSample)
    output.writeBytes("data")
    writeLittleEndianInt(output, pcmBytes.coerceAtMost(Int.MAX_VALUE.toLong()).toInt())
  }

  private fun presentationTimeToFrame(presentationTimeUs: Long, sampleRate: Int): Long {
    val timestampUs = presentationTimeUs.coerceAtLeast(0L)
    return (timestampUs * sampleRate + MICROSECONDS_PER_SECOND / 2L) / MICROSECONDS_PER_SECOND
  }

  private fun framesToMilliseconds(frames: Long, sampleRate: Int): Long =
    if (sampleRate > 0) frames * 1000L / sampleRate else 0L

  private fun writeSilence(output: RandomAccessFile, byteCount: Long) {
    val silence = ByteArray(SILENCE_BUFFER_BYTES)
    var remaining = byteCount
    while (remaining > 0L) {
      val chunkSize = remaining.coerceAtMost(silence.size.toLong()).toInt()
      output.write(silence, 0, chunkSize)
      remaining -= chunkSize
    }
  }

  private fun writeLittleEndianInt(output: RandomAccessFile, value: Int) {
    output.write(value and 0xff)
    output.write(value shr 8 and 0xff)
    output.write(value shr 16 and 0xff)
    output.write(value shr 24 and 0xff)
  }

  private fun writeLittleEndianShort(output: RandomAccessFile, value: Int) {
    output.write(value and 0xff)
    output.write(value shr 8 and 0xff)
  }

  companion object {
    private const val CODEC_TIMEOUT_US = 10_000L
    private const val WAV_HEADER_SIZE = 44
    private const val PCM_BYTES_PER_SAMPLE = 2
    private const val MICROSECONDS_PER_SECOND = 1_000_000L
    private const val SILENCE_BUFFER_BYTES = 16 * 1024
  }
}
