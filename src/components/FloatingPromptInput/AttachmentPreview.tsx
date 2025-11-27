import React, { useState, useEffect } from "react";
import { X, ZoomIn } from "lucide-react";
import { createPortal } from "react-dom";
import { ImagePreview } from "../ImagePreview";

interface AttachmentPreviewProps {
  imageAttachments: Array<{ id: string; previewUrl: string; filePath: string }>;
  embeddedImages: Array<any>;
  onRemoveAttachment: (id: string) => void;
  onRemoveEmbedded: (index: number) => void;
  className?: string;
}

/**
 * 图片放大查看模态框
 */
interface ImageLightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

const ImageLightbox: React.FC<ImageLightboxProps> = ({ src, alt, onClose }) => {
  // ESC 键关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out"
      style={{ zIndex: 9999 }}
      onClick={onClose}
    >
      {/* 关闭按钮 */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors"
      >
        <X className="h-5 w-5" />
      </button>

      {/* 图片 */}
      <img
        src={src}
        alt={alt || "Image preview"}
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body
  );
};

export const AttachmentPreview: React.FC<AttachmentPreviewProps> = ({
  imageAttachments,
  embeddedImages,
  onRemoveAttachment,
  onRemoveEmbedded,
  className
}) => {
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt?: string } | null>(null);

  if (imageAttachments.length === 0 && embeddedImages.length === 0) return null;

  return (
    <>
      {/* 图片放大模态框 */}
      {lightboxImage && (
        <ImageLightbox
          src={lightboxImage.src}
          alt={lightboxImage.alt}
          onClose={() => setLightboxImage(null)}
        />
      )}

      <div className={className}>
        {/* Image attachments preview */}
        {imageAttachments.length > 0 && (
          <div className="mb-2">
            <div className="text-xs font-medium text-muted-foreground mb-2 px-1">附件预览</div>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {imageAttachments.map((attachment) => (
                <div key={attachment.id} className="relative flex-shrink-0 group">
                  <div
                    className="relative w-16 h-16 rounded-md overflow-hidden border border-border/50 shadow-sm cursor-pointer"
                    onClick={() => setLightboxImage({ src: attachment.previewUrl, alt: "Screenshot preview" })}
                  >
                    <img
                      src={attachment.previewUrl}
                      alt="Screenshot preview"
                      className="w-full h-full object-cover"
                    />
                    {/* 悬停时显示放大图标和删除按钮 */}
                    <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 backdrop-blur-[2px]">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setLightboxImage({ src: attachment.previewUrl, alt: "Screenshot preview" });
                        }}
                        className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center hover:bg-primary/90 transition-colors shadow-sm"
                        title="点击放大"
                      >
                        <ZoomIn className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveAttachment(attachment.id);
                        }}
                        className="w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center hover:bg-destructive/90 transition-colors shadow-sm"
                        title="删除"
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
            onImageClick={(src, _index) => setLightboxImage({ src, alt: "Embedded image" })}
            className="pt-2"
          />
        )}
      </div>
    </>
  );
};
