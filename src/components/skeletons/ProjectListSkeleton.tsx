import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export const ProjectListSkeleton: React.FC = () => {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="w-full px-5 py-4 rounded-lg bg-card border border-border/40"
          >
            <div className="flex items-start gap-3 mb-2">
              <Skeleton className="h-9 w-9 rounded-md" />
              <div className="flex-1 min-w-0 pr-20">
                <Skeleton className="h-5 w-3/4 mb-2" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <Skeleton className="h-3 w-full mt-4" />
          </div>
        ))}
      </div>
    </div>
  );
};