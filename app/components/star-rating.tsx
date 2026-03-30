import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { Star } from "lucide-react";
import { toast } from "sonner";

interface StarRatingProps {
  courseSlug: string;
  currentRating: number | null;
}

export function StarRating({ courseSlug, currentRating }: StarRatingProps) {
  const fetcher = useFetcher();
  const [hovered, setHovered] = useState<number | null>(null);
  const prevRatingRef = useRef(currentRating);
  const submittedRatingRef = useRef<number | null>(null);

  if (fetcher.formData) {
    submittedRatingRef.current = Number(fetcher.formData.get("rating"));
  }

  const optimisticRating = submittedRatingRef.current ?? currentRating;
  const displayRating = hovered ?? optimisticRating ?? 0;

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      const wasUpdate = prevRatingRef.current !== null;
      toast.success(wasUpdate ? "Rating updated!" : "Rating submitted!");
      prevRatingRef.current = optimisticRating;
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <div
      className="flex items-center gap-1"
      onMouseLeave={() => setHovered(null)}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onMouseEnter={() => setHovered(star)}
          onClick={() => {
            if (star === optimisticRating) return;
            fetcher.submit(
              { intent: "rate-course", rating: String(star) },
              { method: "post", action: `/courses/${courseSlug}` }
            );
          }}
          className="cursor-pointer p-0.5 transition-colors"
          aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
        >
          <Star
            className={`size-5 ${
              star <= displayRating
                ? "fill-yellow-400 text-yellow-400"
                : "text-muted-foreground"
            }`}
          />
        </button>
      ))}
      {optimisticRating && (
        <span className="ml-1.5 text-sm text-muted-foreground">
          {optimisticRating}/5
        </span>
      )}
    </div>
  );
}

interface StarDisplayProps {
  rating: number;
  count: number;
}

export function StarDisplay({ rating, count }: StarDisplayProps) {
  if (count === 0) return null;

  return (
    <span className="flex items-center gap-1">
      <Star className="size-3.5 fill-yellow-400 text-yellow-400" />
      <span className="text-xs font-medium">{rating.toFixed(1)}</span>
      <span className="text-xs text-muted-foreground">({count})</span>
    </span>
  );
}
