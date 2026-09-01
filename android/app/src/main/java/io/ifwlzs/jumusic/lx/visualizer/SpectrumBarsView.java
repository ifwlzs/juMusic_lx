package io.ifwlzs.jumusic.lx.visualizer;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.view.Choreographer;
import android.view.View;

/**
 * 频谱柱视图，对应 PC 版 AudioVisualizer 的 Canvas 频谱柱。
 *
 * 中文注释：绘制完全留在原生侧。若把每帧 64 个浮点数经 RN 桥送到 JS 再回传布局，
 * 60fps 下就是每秒近 4000 次跨桥调用，必然掉帧；原生直接 invalidate 没有这个成本。
 */
public final class SpectrumBarsView extends View implements AudioSpectrumBus.Listener {

  private final Paint barPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final RectF barRect = new RectF();
  private final float[] levels = new float[AudioSpectrumBus.BAND_COUNT];
  private final float[] rendered = new float[AudioSpectrumBus.BAND_COUNT];
  private final AudioSpectrumBus bus = AudioSpectrumBus.getInstance();

  private int barCount = 32;
  private float gapRatio = 0.32f;
  private float minHeightRatio = 0.02f;
  private float cornerRadius = 2f;
  private boolean mirror = false;
  private int startColor = Color.WHITE;
  private int endColor = Color.WHITE;
  private int shaderHeight = -1;
  private boolean running = false;

  private final Choreographer.FrameCallback frameCallback = new Choreographer.FrameCallback() {
    @Override
    public void doFrame(long frameTimeNanos) {
      if (!running) return;
      // 中文注释：渲染值向采样值做指数逼近，让柱子在两帧采样之间也保持连续运动。
      // 必须遍历全部频段而不是 barCount：levelForBar 折叠时会读到 barCount 之外的下标，
      // 只更新前 barCount 个会让那些位置停在旧值上。
      boolean moved = false;
      for (int i = 0; i < rendered.length; i++) {
        float diff = levels[i] - rendered[i];
        if (Math.abs(diff) > 0.001f) {
          rendered[i] += diff * 0.35f;
          moved = true;
        } else if (rendered[i] != levels[i]) {
          rendered[i] = levels[i];
          moved = true;
        }
      }
      // 中文注释：画面静止时不重绘。暂停播放或长时间静音时频段全零且不再变化，
      // 此时每帧 invalidate 会白耗电却不改变任何像素。新数据到达会重新唤醒循环。
      if (moved) invalidate();
      Choreographer.getInstance().postFrameCallback(this);
    }
  };

  public SpectrumBarsView(Context context) {
    super(context);
    setWillNotDraw(false);
    barPaint.setStyle(Paint.Style.FILL);
  }

  public void setBarCount(int count) {
    barCount = Math.max(4, Math.min(AudioSpectrumBus.BAND_COUNT, count));
    invalidate();
  }

  public void setGapRatio(float ratio) {
    gapRatio = Math.max(0f, Math.min(0.8f, ratio));
    invalidate();
  }

  public void setMinHeightRatio(float ratio) {
    minHeightRatio = Math.max(0f, Math.min(0.5f, ratio));
    invalidate();
  }

  public void setCornerRadius(float radius) {
    cornerRadius = Math.max(0f, radius);
    invalidate();
  }

  public void setMirror(boolean mirror) {
    this.mirror = mirror;
    invalidate();
  }

  public void setColors(int startColor, int endColor) {
    this.startColor = startColor;
    this.endColor = endColor;
    shaderHeight = -1;
    invalidate();
  }

  @Override
  protected void onAttachedToWindow() {
    super.onAttachedToWindow();
    bus.copyLatestInto(levels);
    System.arraycopy(levels, 0, rendered, 0, levels.length);
    bus.addListener(this);
    running = true;
    Choreographer.getInstance().postFrameCallback(frameCallback);
  }

  @Override
  protected void onDetachedFromWindow() {
    running = false;
    Choreographer.getInstance().removeFrameCallback(frameCallback);
    bus.removeListener(this);
    super.onDetachedFromWindow();
  }

  @Override
  public void onSpectrum(float[] bands) {
    // 中文注释：来自音频线程，只做数组拷贝；重绘交给 Choreographer 节流到屏幕刷新率。
    System.arraycopy(bands, 0, levels, 0, Math.min(bands.length, levels.length));
  }

  /** 中文注释：把 64 个频段按比例折叠到实际柱数，取组内最大值保留冲击感。 */
  private float levelForBar(int barIndex) {
    int perBar = AudioSpectrumBus.BAND_COUNT / barCount;
    if (perBar <= 1) return rendered[Math.min(barIndex, rendered.length - 1)];
    int start = barIndex * perBar;
    int end = Math.min(start + perBar, AudioSpectrumBus.BAND_COUNT);
    float peak = 0f;
    for (int i = start; i < end; i++) {
      if (rendered[i] > peak) peak = rendered[i];
    }
    return peak;
  }

  @Override
  protected void onDraw(Canvas canvas) {
    int width = getWidth();
    int height = getHeight();
    if (width <= 0 || height <= 0) return;

    if (shaderHeight != height) {
      barPaint.setShader(new LinearGradient(
        0f, height, 0f, 0f, startColor, endColor, Shader.TileMode.CLAMP));
      shaderHeight = height;
    }

    float slotWidth = (float) width / barCount;
    float barWidth = slotWidth * (1f - gapRatio);
    float gap = (slotWidth - barWidth) / 2f;
    // 中文注释：镜像模式以中线为基准上下对称生长，非镜像则从底部向上生长。
    float baseline = mirror ? height / 2f : height;
    float maxHeight = mirror ? height / 2f : height;
    float minHeight = height * minHeightRatio;

    for (int i = 0; i < barCount; i++) {
      float level = levelForBar(i);
      float barHeight = Math.max(minHeight, level * maxHeight);
      float left = i * slotWidth + gap;
      float right = left + barWidth;

      barRect.set(left, baseline - barHeight, right, mirror ? baseline + barHeight : baseline);
      if (cornerRadius > 0f) {
        canvas.drawRoundRect(barRect, cornerRadius, cornerRadius, barPaint);
      } else {
        canvas.drawRect(barRect, barPaint);
      }
    }
  }
}
