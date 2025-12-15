import { useMemo, useEffect, useState } from "react";
import { useCameraStore } from "../state/useCameraStore";

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const normalizeName = (value) => (value || "").trim().toLowerCase();
const safeSpan = (a, b) => Math.max(1e-6, (b ?? 0) - (a ?? 0));

// CC0 paw icon (Wikimedia Commons)
const PAW_ICON_URL =
  "https://upload.wikimedia.org/wikipedia/commons/5/51/Paw_icon.svg";

export default function StopCircleOverlay() {
  const t = useCameraStore((state) => state.t ?? 0);
  const waypoints = useCameraStore((state) => state.waypoints || []);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 900);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Memoized lookup: name -> normalized t (0..1)
  const stopT = useMemo(() => {
    if (!Array.isArray(waypoints) || waypoints.length < 2) {
      return () => null;
    }

    const segmentCount = waypoints.length - 1;
    const map = new Map();

    waypoints.forEach((wp, i) => {
      const key = normalizeName(wp?.name);
      if (!key) return;
      map.set(key, i / segmentCount);
    });

    return (name) => map.get(normalizeName(name)) ?? null;
  }, [waypoints]);

  const t4 = stopT("stop-4");
  const t5 = stopT("stop-5");
  const t6 = stopT("stop-6");
  const t8 = stopT("stop-8");
  const t9 = stopT("stop-9");
  const t10 = stopT("stop-10");
  const t12 = stopT("stop-12");
  const t13 = stopT("stop-13");
  const t13b = stopT("stop-13b");
  const t13bLeft = stopT("stop-13b-left-1");
  const t14 = stopT("stop-14");
  const t15Spin = stopT("stop-15-spin-360");
  const tRing4b = stopT("ring-4b");
  const tRingClose = stopT("ring-close");
  const tSeqArch1 = stopT("seq-arch-1");
  const tSeqArch2 = stopT("seq-arch-2");
  const tSeqArch3 = stopT("seq-arch-3");
  const tSeqArch4 = stopT("seq-arch-4");

  // ✅ Paw trail hook MUST be called every render (before any return)
  const pawTrail = useMemo(() => {
    const count = isMobile ? 8 : 11;
    const insetPct = 10;
    const span = 100 - insetPct * 2;
    const step = count > 1 ? span / (count - 1) : 0;

    // ✅ Double the spacing for opposite left/right along diagonal
    const basePerpPx = isMobile ? 5 : 7;
    const perpPx = basePerpPx * 3;

    return {
      items: Array.from({ length: count }, (_, i) => {
        const xPct = insetPct + i * step;
        const yPct = insetPct + (count - 1 - i) * step;

        const sign = i % 2 === 0 ? -1 : 1;
        const dx = sign * perpPx;
        const dy = sign * perpPx;

        const rot = 45 + sign * 8;

        return { i, xPct, yPct, dx, dy, rot };
      }),
    };
  }, [isMobile]);

  // ✅ Now it’s safe to early-return (after hooks)
  const EPS = 1e-4;
  const shouldRender =
    t4 !== null && t5 !== null && typeof t4 === "number" && t >= t4 - EPS;

  if (!shouldRender) return null;

  // --- Circle & Backdrop Logic ---
  const progress45 = clamp01((t - t4) / safeSpan(t4, t5));

  let circleOpacity = progress45;
  let backdropOpacity = 0.8 * progress45;
  let glowStrength = 0.25 + 0.45 * progress45;

  let circleScale = isMobile ? 2.0 : 1.0;
  if (t9 !== null && t10 !== null && t > t9) {
    const p910 = clamp01((t - t9) / safeSpan(t9, t10));
    if (!isMobile) circleScale = 1.0 + 1.0 * p910;
    else circleScale = 2.0;
  }

  if (t13bLeft !== null && t > t13bLeft) {
    const collapseDuration = 0.015;
    const pCollapse = clamp01(
      (t - t13bLeft) / safeSpan(t13bLeft, t13bLeft + collapseDuration)
    );
    const collapseFactor = 1.0 - pCollapse;

    circleScale *= collapseFactor;
    circleOpacity *= collapseFactor;
    backdropOpacity *= collapseFactor;
    glowStrength *= collapseFactor;
  }

  // Halo Color Logic
  let haloColor = "255, 220, 100";
  if (t6 !== null && t5 !== null && t9 !== null && t > t5 && t <= t9) {
    const p56 = clamp01((t - t5) / safeSpan(t5, t6));
    const r = Math.round(255 + (255 - 255) * p56);
    const g = Math.round(220 + (140 - 220) * p56);
    const b = Math.round(100 + (50 - 100) * p56);
    haloColor = `${r}, ${g}, ${b}`;
  } else if (t9 !== null && t10 !== null && t > t9 && t <= t10) {
    const p910 = clamp01((t - t9) / safeSpan(t9, t10));
    const r = Math.round(255 + (100 - 255) * p910);
    const g = Math.round(140 + (255 - 140) * p910);
    const b = Math.round(50 + (100 - 50) * p910);
    haloColor = `${r}, ${g}, ${b}`;
  } else if (t10 !== null && t13 !== null && t > t10) {
    const p1013 = clamp01((t - t10) / safeSpan(t10, t13));
    const r = Math.round(100 + (255 - 100) * p1013);
    const g = Math.round(255 + (255 - 255) * p1013);
    const b = Math.round(100 + (255 - 100) * p1013);
    haloColor = `${r}, ${g}, ${b}`;
  }

  // ✅ Paw trail: runs ONCE after "This is me Habib" finishes rendering
  // Start paws 15% into t5→t6 window (after Habib text is fully visible)
  let pawAnimProgress = 0;
  let pawLayerActive = false;
  if (
    t5 !== null &&
    t6 !== null &&
    Number.isFinite(t5) &&
    Number.isFinite(t6)
  ) {
    const pawDelay = 0.15; // Delay as fraction of t5→t6 span
    const pawStartT = t5 + safeSpan(t5, t6) * pawDelay;
    if (t >= pawStartT && t <= t6) {
      pawAnimProgress = clamp01((t - pawStartT) / safeSpan(pawStartT, t6));
      pawLayerActive = true;
    }
  }

  // Calculate individual paw opacities for sequential animation with fading tail
  const getPawOpacity = (pawIndex, totalPaws) => {
    if (!pawLayerActive) return 0;

    const tailLength = 0.35; // How long each paw stays visible (as fraction of animation)
    const pawStart = pawIndex / totalPaws; // When this paw starts appearing
    const pawPeak = pawStart + 0.08; // Quick fade-in
    const pawEnd = pawStart + tailLength; // When paw fully fades out

    if (pawAnimProgress < pawStart) return 0;
    if (pawAnimProgress < pawPeak) {
      // Fade in
      return clamp01((pawAnimProgress - pawStart) / (pawPeak - pawStart));
    }
    if (pawAnimProgress < pawEnd) {
      // Fade out (tail effect)
      return clamp01(1 - (pawAnimProgress - pawPeak) / (pawEnd - pawPeak));
    }
    return 0;
  };

  const pawLayerOpacity = clamp01(circleOpacity);

  // x3 size (kept)
  const pawSize = isMobile ? 48 : 60;

  // --- Text Logic (unchanged) ---
  const textSegments = [
    {
      text: "Hello, this is me Habib.",
      startIn: t4,
      endIn: t5,
      startOut: t5,
      endOut: t6,
    },
    {
      text: "This is my cat Skye",
      startIn: t5,
      endIn: t6,
      startOut: t8,
      endOut: t9,
      delayIn: 0.5,
    },
    {
      text: "Nature is all around us",
      startIn: t9,
      endIn: t12 || t10,
      startOut: t13 ? t13 - 0.02 : (t10 ?? 0) + 0.5,
      endOut: t13 || (t10 ?? 0) + 1.0,
      delayIn: 0.0,
      type: "carousel",
    },
    {
      text: "But, we are connected through technology",
      startIn: t13,
      endIn: t13b
        ? t13 + (t13b - t13) * 0.8
        : t14
        ? t13 + (t14 - t13) * 0.8
        : t13 + 0.06,
      startOut: t13b ? t13 + (t13b - t13) * 0.8 : t14 ? t14 - 0.02 : t13 + 0.2,
      endOut: t13b || t14 || t13 + 0.3,
      delayIn: 0.0,
      type: "carousel",
    },
  ];

  const renderText = (segment, index) => {
    const {
      text,
      startIn,
      endIn,
      startOut,
      endOut,
      delayIn = 0,
      type,
    } = segment;

    if (!Number.isFinite(startIn) || !Number.isFinite(endIn)) return null;

    const words = text.split(" ");
    const spanIn = safeSpan(startIn, endIn);
    const spanOut = endOut ? safeSpan(startOut, endOut) : 0.1;

    let phase = "hidden";
    let localP = 0;

    if (t < startIn) phase = "hidden";
    else if (t <= endIn) {
      phase = "in";
      localP = clamp01((t - startIn) / spanIn);
    } else if (!endOut || t < startOut) {
      phase = "hold";
      localP = 1;
    } else if (t <= endOut) {
      phase = "out";
      localP = clamp01((t - startOut) / spanOut);
    } else phase = "hidden";

    if (phase === "hidden") return null;

    if (type === "carousel") {
      let activeIndex = -1;
      let wordP = 0;

      if (phase === "in") {
        const totalWords = words.length;
        const slotSize = 1 / totalWords;
        activeIndex = Math.floor(localP / slotSize);
        if (activeIndex >= totalWords) activeIndex = totalWords - 1;

        const slotStart = activeIndex * slotSize;
        wordP = (localP - slotStart) / slotSize;
      } else {
        activeIndex = words.length - 1;
        wordP = 0.5;
      }

      return (
        <div
          key={index}
          className="stop-overlay-text"
          style={{
            gridArea: "1/1",
            transform: "translateY(-50%)",
            pointerEvents: "none",
            width: "max-content",
            transformOrigin: "left center",
          }}
        >
          {words.map((word, i) => {
            if (i !== activeIndex) return null;

            let opacity = 0;
            let translateY = 0;

            if (phase === "in") {
              if (wordP < 0.2) {
                const p = wordP / 0.2;
                opacity = p;
                translateY = -20 * (1 - p);
              } else if (wordP > 0.8 && i < words.length - 1) {
                const p = (wordP - 0.8) / 0.2;
                opacity = 1 - p;
                translateY = 20 * p;
              } else {
                opacity = 1;
                translateY = 0;
              }
            } else if (phase === "out") {
              opacity = 1 - localP;
              translateY = 20 * localP;
            } else {
              opacity = 1;
              translateY = 0;
            }

            return (
              <span
                key={i}
                style={{
                  opacity,
                  transform: `translateY(${translateY}px)`,
                  display: "inline-block",
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
      );
    }

    return (
      <div
        key={index}
        className="stop-overlay-text"
        style={{
          gridArea: "1/1",
          transform: "translateY(-50%)",
          pointerEvents: "none",
          width: "max-content",
          transformOrigin: "left center",
        }}
      >
        {words.map((word, i) => {
          let opacity = 0;
          let translateY = 0;

          if (phase === "in") {
            const effectiveStart = 0.2 + delayIn * 0.5 + i * 0.1;
            const duration = 0.3;
            const p = clamp01((localP - effectiveStart) / duration);
            opacity = p;
            translateY = -150 * (1 - p);
          } else if (phase === "hold") {
            opacity = 1;
            translateY = 0;
          } else if (phase === "out") {
            const start = i * 0.08;
            const duration = 0.3;
            const p = clamp01((localP - start) / duration);
            opacity = 1 - p;
            translateY = 150 * p;
          }

          return (
            <span
              key={i}
              style={{
                opacity,
                transform: `translateY(${translateY}px)`,
                display: "inline-block",
                marginRight: "0.25em",
              }}
            >
              {word}
            </span>
          );
        })}
      </div>
    );
  };

  const renderTopCenterText = () => {
    if (t14 === null || t15Spin === null || tRing4b === null) return null;

    const text = "We craft the extraordinary with our creativity";
    const words = text.split(" ");

    const startIn = t14;
    const endIn = t15Spin;
    const startOut = t15Spin;
    const endOut = tRing4b;

    let phase = "hidden";
    let localP = 0;

    if (t < startIn) phase = "hidden";
    else if (t <= endIn) {
      phase = "in";
      localP = clamp01((t - startIn) / safeSpan(startIn, endIn));
    } else if (t <= endOut) {
      phase = "out";
      localP = clamp01((t - startOut) / safeSpan(startOut, endOut));
    } else phase = "hidden";

    if (phase === "hidden") return null;

    return (
      <div
        style={{
          position: "absolute",
          top: "15%",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: "0.3em",
          pointerEvents: "none",
          zIndex: 60,
          fontFamily: "var(--font-family, sans-serif)",
          fontSize: "1.5rem",
          color: "white",
          textShadow: "0 2px 4px rgba(0,0,0,0.5)",
          whiteSpace: "normal",
          width: "90%",
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        {words.map((word, i) => {
          const wordCount = words.length;
          const step = 1 / (wordCount + 2);
          const wordStart = i * step;
          const wordEnd = wordStart + 3 * step;

          let wordProgress = 0;
          if (localP >= wordStart) {
            wordProgress = clamp01(
              (localP - wordStart) / safeSpan(wordStart, wordEnd)
            );
          }

          let opacity = 0;
          let translateY = 0;

          if (phase === "in") {
            opacity = wordProgress;
            translateY = 10 * (1 - wordProgress);
          } else {
            opacity = 1 - wordProgress;
            translateY = -10 * wordProgress;
          }

          return (
            <span
              key={i}
              style={{
                opacity,
                transform: `translateY(${translateY}px)`,
                display: "inline-block",
              }}
            >
              {word}
            </span>
          );
        })}
      </div>
    );
  };

  const renderArchTexts = () => {
    if (
      tSeqArch1 === null ||
      tSeqArch2 === null ||
      tSeqArch3 === null ||
      tSeqArch4 === null
    ) {
      return null;
    }

    const segments = [
      {
        lines: ["We make", "creative 3D & full-stack websites"],
        start: tSeqArch1,
        end: tSeqArch2,
      },
      {
        lines: ["We Develop", "AI models & softwares"],
        start: tSeqArch3,
        end: tSeqArch4,
      },
    ];

    const activeSegment = segments.find((s) => t >= s.start && t <= s.end);
    if (!activeSegment) return null;

    const { lines, start, end } = activeSegment;
    const localP = clamp01((t - start) / safeSpan(start, end));

    const topPos = 10 + localP * 80;

    let opacity = 1;
    if (localP < 0.25) opacity = localP / 0.25;
    else if (localP > 0.75) opacity = 1 - (localP - 0.75) / 0.25;

    return (
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: `${topPos}%`,
          transform: "translate(-50%, -50%)",
          width: "90%",
          maxWidth: "1200px",
          textAlign: "center",
          pointerEvents: "none",
          zIndex: 60,
          fontFamily: '"Georama", sans-serif',
          fontOpticalSizing: "auto",
          fontSize: "clamp(2rem, 5vw, 4.5rem)",
          fontWeight: "300",
          letterSpacing: "0.02em",
          lineHeight: "1.1",
          color: "#ffffff",
          textShadow: "0 2px 12px rgba(0,0,0,0.5)",
          whiteSpace: "normal",
          opacity,
        }}
      >
        {lines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    );
  };

  const layoutCircleScale = !isMobile ? Math.max(circleScale, 1) : 1;

  return (
    <div
      className="stop-overlay-container"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 50,
      }}
    >
      {renderTopCenterText()}
      {renderArchTexts()}

      {/* Paw trail overlay (bottom-right quarter) - sequential with fading tail */}
      {pawLayerActive && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            width: "50%",
            height: "50%",
            pointerEvents: "none",
            zIndex: 55,
            opacity: pawLayerOpacity,
          }}
        >
          {pawTrail.items.map((p) => {
            const individualOpacity = getPawOpacity(p.i, pawTrail.items.length);
            if (individualOpacity <= 0) return null;

            return (
              <div
                key={p.i}
                style={{
                  position: "absolute",
                  left: `${p.xPct}%`,
                  top: `${p.yPct}%`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <img
                  src={PAW_ICON_URL}
                  alt=""
                  draggable={false}
                  style={{
                    width: pawSize,
                    height: pawSize,
                    display: "block",
                    opacity: individualOpacity,
                    transform: `translate(${p.dx}px, ${p.dy}px) rotate(${p.rot}deg)`,
                    transformOrigin: "center",
                    // white paws
                    filter:
                      "invert(1) brightness(2) drop-shadow(0 2px 8px rgba(0,0,0,0.35))",
                    userSelect: "none",
                  }}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Wrapper for Circle */}
      <div
        className="stop-circle-wrapper"
        style={{
          width: "clamp(180px, 45vw, 420px)",
          height: "clamp(180px, 45vw, 420px)",
          transform: `scale(${circleScale})`,
        }}
      >
        <div
          aria-hidden="true"
          style={{
            gridArea: "1/1",
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            boxShadow: `0 0 0 200vmax rgba(30, 30, 30, ${backdropOpacity})`,
          }}
        />
        <div
          aria-hidden="true"
          style={{
            gridArea: "1/1",
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            border: "2px solid rgba(255, 255, 255, 0.9)",
            opacity: circleOpacity,
            boxShadow: `0 0 55px rgba(${haloColor}, ${glowStrength})`,
            backdropFilter: "blur(2px)",
            mixBlendMode: "screen",
          }}
        />
        <div
          aria-hidden="true"
          style={{
            gridArea: "1/1",
            width: "140%",
            height: "120%",
            borderRadius: "50%",
            opacity: circleOpacity * 0.55,
            filter: "blur(45px)",
            boxShadow: `0 0 120px rgba(${haloColor}, ${glowStrength})`,
            transform: "scaleX(1.1)",
            mixBlendMode: "screen",
          }}
        />
      </div>

      {/* Text Container */}
      <div
        style={{
          position: "absolute",
          ...(isMobile
            ? {
                left: "50%",
                top: `calc(75% + clamp(180px, 45vw, 420px) * ${
                  circleScale * 0.25
                })`,
                transform: "translate(-50%, -50%)",
                width: "80%",
                textAlign: "center",
                display: "grid",
                placeItems: "center",
              }
            : {
                left: `calc(50% + clamp(180px, 45vw, 420px) * 0.5 * ${layoutCircleScale} + 60px)`,
                top: "50%",
                transform: "translateY(-50%)",
                marginLeft: "0",
                display: "grid",
                placeItems: "center start",
              }),
        }}
        className="stop-overlay-text-container"
      >
        {textSegments.map(renderText)}
      </div>
    </div>
  );
}
