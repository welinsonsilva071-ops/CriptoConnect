
"use client";

import { Badge } from "@/components/ui/badge";

export default function DateSeparator({ date }: { date: string }) {
  return (
    <div className="flex justify-center my-4">
      <Badge variant="secondary" className="px-3 py-1 text-xs font-semibold">
        {date}
      </Badge>
    </div>
  );
}
