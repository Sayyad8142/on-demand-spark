import { useEffect, useRef, useState } from "react";
import { displayText, useWorkerLanguage } from "@/i18n/display";
import type { TrainingSlide } from '@/lib/serviceTraining';
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
  slides?: TrainingSlide[];
}

/** Shared service training presentation; no booking mutation or authorization. */
export default function DishwashingTrainingCarousel({ fallbackSrc, alt, className, slides: suppliedSlides }: Props) {
  useWorkerLanguage();
  const slides: TrainingSlide[] = suppliedSlides ?? trainingSlides(DISHWASHING_TRAINING_PHOTOS);
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
  }, [slides]);

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
      onTouchStart={(e) => { startX.current = e.touches[0]?.clientX ?? null; e.stopPropagation(); }}
      onTouchEnd={(e) => {
        if (startX.current == null) return;
        const end = e.changedTouches[0];
        if (!end) return;
        const dx = end.clientX - startX.current;
        startX.current = null;
        setIndex((i) => swipeTarget(i, count, dx));
        e.stopPropagation();
      }}
    >
      <div
        className="flex transition-transform duration-500 ease-in-out motion-reduce:transition-none will-change-transform"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {slides.map((s, i) => (
          <div key={s.step} className="relative w-full shrink-0">
          <img
            key={s.step}
            src={failed[s.step] ? s.fallbackSrc ?? fallbackSrc : s.src}
            alt={displayText(s.label)}
            className={`${className} flex-shrink-0`}
            loading="eager"
            decoding="async"
            draggable={false}
            onError={() => { if (!failed[s.step]) setFailed((f) => ({ ...f, [s.step]: true })); }}
          />
          {s.price != null && s.price > 0 && <span className="absolute bottom-2.5 right-2.5 rounded-md bg-card/90 text-card-foreground px-3 py-1 font-bold">₹{s.price}</span>}
          </div>
        ))}
      </div>
      {count > 1 && (
        <div className="absolute bottom-2.5 left-3 z-10 flex gap-1 pointer-events-none rounded-md bg-foreground/60 px-2 py-1.5" aria-label={`${index + 1} / ${count}`}>
          {slides.map((s, i) => (
            <span
              key={s.step}
              className={`h-1 rounded-full bg-background transition-all ${i === index ? "w-4 opacity-100" : "w-1.5 opacity-60"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
