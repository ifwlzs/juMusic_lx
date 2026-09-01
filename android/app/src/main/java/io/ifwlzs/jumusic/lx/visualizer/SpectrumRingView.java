package io.ifwlzs.jumusic.lx.visualizer;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.view.Choreographer;
import android.view.View;

/**
 * 环形波纹视图，Karaoke 风格：套在专辑封面外圈随音乐起伏。
 *
 * 中文注释：与频谱柱共用同一份频段数据，差别只在几何映射：
 *   - 频谱柱把频段映射到 x 轴
 *   - 环形波纹把频段映射到极角，半径 = 基础半径 + 幅值
 * 另外做了首尾环绕平滑，否则 0 度接缝处会出现明显的断裂台阶。
 */
public final class SpectrumRingView extends View implements AudioSpectrumBus.Listener {

  private final Paint ringPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final Paint glowPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final Path ringPath = new Path();
  private final float[] levels = new float[AudioSpectrumBus.BAND_COUNT];
  private final float[] rendered = new float[AudioSpectrumBus.BAND_COUNT];
  private final AudioSpectrumBus bus = AudioSpectrumBus.getInstance();

  /** 中文注释：极角采样点数量，取频段数的 2 倍以获得平滑轮廓。 */
  private static final int POINT_COUNT = AudioSpectrumBus.BAND_COUNT * 2;
  private final float[] radii = new float[POINT_COUNT];

  private float baseRadiusRatio = 0.62f;
  private float amplitudeRatio = 0.16f;
  private float strokeWidth = 2f;
  private float rotationSpeed = 6f;
  private boolean showGlow = true;
  private int ringColor = Color.WHITE;
  private float rotation = 0f;
  private long lastFrameNanos = 0L;
  private boolean running = false;

  private final Choreographer.FrameCallback frameCallback = new Choreographer.FrameCallback() {
    @Override
    public void doFrame(long frameTimeNanos) {
      if (!running) return;
      boolean moved = false;
      for (int i = 0; i < rendered.length; i++) {
        float diff = levels[i] - rendered[i];
        if (Math.abs(diff) > 0.0005f) {
          rendered[i] += diff * 0.3f;
          moved = true;
        } else if (rendered[i] != levels[i]) {
          rendered[i] = levels[i];
          moved = true;
        }
        if (rendered[i] > 0.0005f) moved = true;
      }

      // 中文注释：只有轮廓不是完全静止的正圆时才推进自转并重绘。
      // 暂停播放时频段全零，环退化成一个正圆，转动它在视觉上没有任何变化，
      // 却会让这个页面一直以屏幕刷新率重绘并持续耗电。
      if (moved) {
        if (lastFrameNanos != 0L) {
          float deltaSeconds = (frameTimeNanos - lastFrameNanos) / 1_000_000_000f;
          // 中文注释：缓慢自转让持续播放中的平缓段落也保持生气，同时避免与节拍抢注意力。
          rotation = (rotation + rotationSpeed * deltaSeconds) % 360f;
        }
        lastFrameNanos = frameTimeNanos;
        invalidate();
      } else {
        // 中文注释：静止期间清零时间基准，避免恢复播放时用一个很大的 delta 让环猛地跳转。
        lastFrameNanos = 0L;
      }
      Choreographer.getInstance().postFrameCallback(this);
    }
  };

  public SpectrumRingView(Context context) {
    super(context);
    setWillNotDraw(false);
    ringPaint.setStyle(Paint.Style.STROKE);
    ringPaint.setStrokeJoin(Paint.Join.ROUND);
    glowPaint.setStyle(Paint.Style.STROKE);
    glowPaint.setStrokeJoin(Paint.Join.ROUND);
  }

  public void setBaseRadiusRatio(float ratio) {
    baseRadiusRatio = Math.max(0.1f, Math.min(0.95f, ratio));
    invalidate();
  }

  public void setAmplitudeRatio(float ratio) {
    amplitudeRatio = Math.max(0.01f, Math.min(0.5f, ratio));
    invalidate();
  }

  public void setStrokeWidth(float width) {
    strokeWidth = Math.max(0.5f, width);
    invalidate();
  }

  public void setRotationSpeed(float speed) {
    rotationSpeed = speed;
  }

  public void setShowGlow(boolean showGlow) {
    this.showGlow = showGlow;
    invalidate();
  }

  public void setRingColor(int color) {
    ringColor = color;
    invalidate();
  }

  @Override
  protected void onAttachedToWindow() {
    super.onAttachedToWindow();
    bus.copyLatestInto(levels);
    System.arraycopy(levels, 0, rendered, 0, levels.length);
    bus.addListener(this);
    running = true;
    lastFrameNanos = 0L;
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
    System.arraycopy(bands, 0, levels, 0, Math.min(bands.length, levels.length));
  }

  @Override
  protected void onDraw(Canvas canvas) {
    int width = getWidth();
    int height = getHeight();
    if (width <= 0 || height <= 0) return;

    float centerX = width / 2f;
    float centerY = height / 2f;
    float shortSide = Math.min(width, height) / 2f;
    float baseRadius = shortSide * baseRadiusRatio;
    float amplitude = shortSide * amplitudeRatio;

    // 中文注释：先把频段镜像展开成一整圈，左右对称能让轮廓看起来是「呼吸」而非「跑马灯」。
    int half = POINT_COUNT / 2;
    for (int i = 0; i < half; i++) {
      int bandIndex = i * AudioSpectrumBus.BAND_COUNT / half;
      float level = rendered[Math.min(bandIndex, rendered.length - 1)];
      float radius = baseRadius + level * amplitude;
      radii[i] = radius;
      radii[POINT_COUNT - 1 - i] = radius;
    }

    // 中文注释：环绕式三点平均，消除接缝与相邻频段的锯齿。
    float previous = radii[POINT_COUNT - 1];
    float first = radii[0];
    for (int i = 0; i < POINT_COUNT; i++) {
      float next = i == POINT_COUNT - 1 ? first : radii[i + 1];
      float current = radii[i];
      radii[i] = (previous + current * 2f + next) / 4f;
      previous = current;
    }

    ringPath.reset();
    double angleStep = 2 * Math.PI / POINT_COUNT;
    double rotationRad = Math.toRadians(rotation);
    for (int i = 0; i < POINT_COUNT; i++) {
      double angle = angleStep * i + rotationRad;
      float x = centerX + (float) Math.cos(angle) * radii[i];
      float y = centerY + (float) Math.sin(angle) * radii[i];
      if (i == 0) ringPath.moveTo(x, y);
      else ringPath.lineTo(x, y);
    }
    ringPath.close();

    if (showGlow) {
      // 中文注释：外圈画一层更粗更透明的同色描边充当光晕，比 BlurMaskFilter 省得多。
      glowPaint.setColor(ringColor);
      glowPaint.setAlpha(60);
      glowPaint.setStrokeWidth(strokeWidth * 3.5f);
      canvas.drawPath(ringPath, glowPaint);
    }

    ringPaint.setColor(ringColor);
    ringPaint.setStrokeWidth(strokeWidth);
    canvas.drawPath(ringPath, ringPaint);
  }
}
