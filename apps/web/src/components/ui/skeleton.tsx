import type * as React from "react";
import { cn } from "@/lib/utils";

// Kerangka loading dengan kilau (utility `skeleton` di index.css), bukan spinner.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="skeleton" aria-hidden className={cn("skeleton h-4", className)} {...props} />
  );
}

export { Skeleton };
