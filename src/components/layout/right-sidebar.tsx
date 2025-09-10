
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function RightSidebar() {

  return (
    <div className="sticky top-4 flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Atividade Recente</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Nenhuma atividade recente para mostrar.</p>
        </CardContent>
      </Card>
    </div>
  );
}
