import { useEffect, useRef, useState } from "react";
import { displayText } from "@/i18n/display";
import {
  DISHWASHING_SLIDE_MS,
  DISHWASHING_TRAINING_PHOTOS,
  nextSlide,
  swipeTarget,
  trainingSlides,
} from "@/lib/dishwashingTraining";

interface Props {
  fallbackSrc: string;
  alt: string;
  className: string;
}

/** Auto-sliding Dishwashing training photos; falls back to the existing image. */
export default function DishwashingTrainingCarousel({ fallbackSrc, alt, className }: Props) {
  const slides = trainingSlides(DISHWASHING_TRAINING_PHOTOS);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [visible, setVisible] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const startX = useRef<number | null>(null);
  const count = slides.length;

  // Preload every slide once so swipes and auto-slides never wait on the network.
  useEffect(() => {
    slides.forEach((s) => { const img = new Image(); img.src = s.src; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, [count]);

  useEffect(() => {
    if (count <= 1 || !visible) return;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      setIndex((i) => nextSlide(i, count));
    }, DISHWASHING_SLIDE_MS);
    return () => clearInterval(id);
  }, [count, visible, index]);

  if (count === 0) return <img src={fallbackSrc} alt={alt} className={className} />;

  return (
    <div
      ref={rootRef}
      className="relative overflow-hidden"
      onTouchStart={(e) => { startX.current = e.touches[0].clientX; e.stopPropagation(); }}
      onTouchEnd={(e) => {
        if (startX.current == null) return;
        const dx = e.changedTouches[0].clientX - startX.current;
        startX.current = null;
        setIndex((i) => swipeTarget(i, count, dx));
        e.stopPropagation();
      }}
    >
      <div
        className="flex transition-transform duration-500 ease-in-out will-change-transform"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {slides.map((s, i) => (
          <img
            key={s.step}
            src={failed[s.step] ? fallbackSrc : s.src}
            alt={displayText(s.label)}
            className={`${className} flex-shrink-0`}
            loading="eager"
            decoding="async"
            draggable={false}
            onError={() => setFailed((f) => ({ ...f, [s.step]: true }))}
          />
        ))}
      </div>
      {count > 1 && (
        <div className="absolute bottom-2.5 left-3 z-10 flex gap-1 pointer-events-none">
          {slides.map((s, i) => (
            <span
              key={s.step}
              className={`h-1 rounded-full bg-white transition-all ${i === index ? "w-4 opacity-100" : "w-1.5 opacity-60"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
