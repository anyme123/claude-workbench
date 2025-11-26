import React from "react";
import { X } from "lucide-react";
import { ImagePreview } from "../ImagePreview";

interface AttachmentPreviewProps {
  imageAttachments: Array<{ id: string; previewUrl: string; filePath: string }>;
  embeddedImages: Array<any>;
  onRemoveAttachment: (id: string) => void;
  onRemoveEmbedded: (index: number) => void;
  className?: string;
}

export const AttachmentPreview: React.FC<AttachmentPreviewProps> = ({
  imageAttachments,
  embeddedImages,
  onRemoveAttachment,
  onRemoveEmbedded,
  className
}) => {
  if (imageAttachments.length === 0 && embeddedImages.length === 0) return null;

  return (
    <div className={className}>
      {/* Image attachments preview */}
      {imageAttachments.length > 0 && (
        <div className="mb-2">
          <div className="text-xs font-medium text-muted-foreground mb-2 px-1">附件预览</div>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {imageAttachments.map((attachment) => (
              <div key={attachment.id} className="relative flex-shrink-0 group">
                <div className="relative w-16 h-16 rounded-md overflow-hidden border border-border/50 shadow-sm">
                  <img
                    src={attachment.previewUrl}
                    alt="Screenshot preview"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                    <button
                      onClick={() => onRemoveAttachment(attachment.id)}
                      className="w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center hover:bg-destructive/90 transition-colors shadow-sm"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Embedded images preview */}
      {embeddedImages.length > 0 && (
        <ImagePreview
          images={embeddedImages}
          onRemove={onRemoveEmbedded}
          className="pt-2"
        />
      )}
    </div>
  );
};