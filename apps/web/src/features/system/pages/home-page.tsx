import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useHealth } from "../api.ts";

function ApiStatus() {
  const health = useHealth();

  if (health.isPending) return <Badge variant="secondary">Memeriksa…</Badge>;
  if (health.isError) return <Badge variant="destructive">API tidak terjangkau</Badge>;
  if (health.data.status === "ok") return <Badge>API & database normal</Badge>;
  return <Badge variant="destructive">Database tidak terhubung</Badge>;
}

export function HomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Beranda</h1>
        <p className="text-muted-foreground text-sm">
          Fondasi aplikasi siap. Modul akan ditambahkan bertahap.
        </p>
      </div>
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Status sistem</CardTitle>
          <CardDescription>Koneksi web ke API dan database.</CardDescription>
        </CardHeader>
        <CardContent>
          <ApiStatus />
        </CardContent>
      </Card>
    </div>
  );
}
