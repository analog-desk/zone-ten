# Measurement model

1. **Exposure metadata.** Photo path: EXIF `ExposureTime`, `FNumber`, `ISOSpeedRatings`. Photos without them are refused, never guessed. Live path: `MediaStreamTrack` settings `exposureTime` (100 µs units) and `iso` in manual exposure mode; lens f-number learned from a photo's EXIF (editable).
2. **Pixels.** Decoded image downsampled to a 64-wide grid; each cell is the mean of sRGB-linearised Rec.709 luminance; clipped pixels (any channel ≥ 250) counted.
3. **Pattern.** Average (uniform), centre-weighted (Gaussian σ = 0.22 of width), spot (circle, 2–20 % of width), multi-point (spots averaged in stops).
4. **EV.** `EV₁₀₀ = log₂(N²/t) − log₂(ISO/100) + log₂(Y/0.18) + offset`.
5. **Reliability.** Clipped > 25 %, below noise floor (Y < 0.012), pinned at exposure limits, or > 2.5 stops from the phone's exposure → flagged.
6. **Live control.** Null metering: the controller moves the metered area toward Y = 0.18 (damped, 0.12-stop dead band), low ISO first, preview time ≤ 1/15 s until ISO is maxed. Readings smoothed in the log domain; "stable" when the last 12 readings agree within ±0.1 stop.

Known error sources: phone ISO is not film ISO; JPEG tone curves and local HDR; flare; lens vignetting. Calibration absorbs the constant part; the rest is why far-from-exposure areas are flagged.
