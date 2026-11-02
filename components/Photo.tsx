import Image from "next/image";
import type { Photo as PhotoT } from "@/content/site";

/** Фото з next/image (автоматичні WebP/AVIF і розміри під екран) */
export function Photo({ photo, priority, sizes }: { photo: PhotoT; priority?: boolean; sizes: string }) {
  return (
    <Image
      src={photo.src}
      alt={photo.alt}
      width={photo.width}
      height={photo.height}
      priority={priority}
      sizes={sizes}
      unoptimized={photo.src.endsWith(".svg")}
    />
  );
}
