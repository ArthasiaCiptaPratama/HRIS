import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * TM-D33: pemuat bertahap. Penanda di ujung daftar memuat halaman berikutnya otomatis saat terlihat
 * (IntersectionObserver, tetap memuat bila masih terlihat setelah satu muatan); tombol "Muat lagi"
 * selalu ada sebagai cadangan (keyboard, browser tanpa IntersectionObserver).
 */
export function LoadMoreSentinel({
  hasMore,
  loading,
  onLoad,
  label = "Muat lagi",
}: {
  hasMore: boolean;
  loading: boolean;
  onLoad: () => void;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((e) => e.isIntersecting)),
      { rootMargin: "240px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (visible && hasMore && !loading) onLoad();
  }, [visible, hasMore, loading, onLoad]);
  if (!hasMore) return null;
  return (
    <div ref={ref} className="flex justify-center py-3">
      <Button variant="outline" size="sm" disabled={loading} onClick={onLoad}>
        {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {loading ? "Memuat…" : label}
      </Button>
    </div>
  );
}
