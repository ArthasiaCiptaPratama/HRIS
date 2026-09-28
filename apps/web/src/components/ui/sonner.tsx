import { Toaster as Sonner, type ToasterProps } from "sonner";

// Disederhanakan dari templat shadcn: tanpa next-themes (projek belum memakai pengelola tema).
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
