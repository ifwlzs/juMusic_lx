# Play Detail Background Preview Tool

运行本地预览服务器：

```bash
npm run preview:play-detail-bg
```

然后打开 `http://127.0.0.1:4866`。

## 这版对齐什么效果

这次的目标不是上一版的渐变映射，而是直接参考仓库根目录的 `1.html`：

- 底图来自封面图
- `background-size: 100% 100%`
- 高强度 `blur`
- 上面盖一层 `color-mask`
- 最外层再叠 `vignette`

也就是更接近你现在手里已经满意的那种“强制拉伸 + 高模糊 + 灰偏主色蒙版 + 均匀压边”效果。

## gray-biased color mask

这个工具现在会从图片里提取**主要色相**，再把它压成固定的偏灰 HSL 参数：

- `maskSaturation` 默认 `0.312`
- `maskLightness` 默认 `0.433`
- `colorMaskOpacity` 默认 `0.37`
- 色相会先做 `15°` 步长吸附

这样可以得到更稳定的“主色偏灰”蒙版色，而不是直接拿封面里的脏杂色。

你提到的两个样例，目标就是这类结果：

- `MIMI,可不 - くうになる (feat. 可不).jpg` → 接近 `rgb(145 76 76 / 37%)`
- `李縺琦,亚哲大大 - 2019.End.jpg` → 接近 `rgb(76 110 145 / 37%)`

## 控件说明

| 控件 | 作用 |
| --- | --- |
| `stretchScale` | 在 1.html 的强制拉伸基础上再做轻微缩放，便于裁掉边缘瑕疵。 |
| `blurRadius` | 底图模糊半径。 |
| `imageBrightness` | 底图亮度。 |
| `imageContrast` | 底图对比度。 |
| `maskColor` | 当前真正应用到 `color-mask` 的颜色，可手动改。 |
| `colorMaskOpacity` | `color-mask` 的透明度。 |
| `maskSaturation` | 自动蒙版色使用的固定饱和度。 |
| `maskLightness` | 自动蒙版色使用的固定明度。 |
| `vignetteColor` | `vignette` 的压边颜色。 |
| `vignetteSize` | `vignette` 的内阴影范围。 |

## 使用方式

1. 先上传一张封面，或者点内置 preset。
2. 看左侧 `Auto mask` 给出的自动灰偏主色。
3. 如果自动色靠谱，就点 `应用自动蒙版色`。
4. 然后继续微调 `maskColor`、`colorMaskOpacity`、`vignetteColor`、`vignetteSize`。
5. 调到满意后，再把这组值带回正式实现。
