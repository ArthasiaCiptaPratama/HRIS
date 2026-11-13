import { useEffect, useState } from "react";

/**
 * ORG-D6: layar < 1024 px atau pointer kasar (sentuh) → mode edit "ketuk": seret kartu, titik atas, dan
 * avatar dimatikan (bentrok dengan geser kanvas); aksi lewat ketuk kartu → toolbar.
 */
export const COMPACT_EDIT_QUERY = "(max-width: 1023px), (pointer: coarse)";

function matches(): boolean {
  return (
    typeof window !== "undefined" && (window.matchMedia?.(COMPACT_EDIT_QUERY).matches ?? false)
  );
}

export function useCompactEdit(): boolean {
  const [compact, setCompact] = useState(matches);
  useEffect(() => {
    const media = window.matchMedia?.(COMPACT_EDIT_QUERY);
    if (!media) return;
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return compact;
}
