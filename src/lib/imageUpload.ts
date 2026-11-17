export async function compressImageFile(
  file: File,
  maxDimension = 720,
  quality = 0.85
): Promise<{ blob: Blob; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Selecione um arquivo de imagem válido (JPG, PNG ou WebP)."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Falha ao ler a imagem selecionada."));
    reader.onload = () => {
      const originalDataUrl = typeof reader.result === "string" ? reader.result : "";
      const img = new Image();

      img.onerror = () => {
        // Fallback caso o browser não consiga decodificar no Image/Canvas (ex.: HEIC/SVG)
        resolve({ blob: file, dataUrl: originalDataUrl });
      };

      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          resolve({ blob: file, dataUrl: originalDataUrl });
          return;
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve({ blob, dataUrl });
            } else {
              resolve({ blob: file, dataUrl });
            }
          },
          "image/jpeg",
          quality
        );
      };

      img.src = originalDataUrl;
    };

    reader.readAsDataURL(file);
  });
}

export async function uploadProfileImage(file: File): Promise<string> {
  const { blob, dataUrl } = await compressImageFile(file);

  try {
    const formData = new FormData();
    const uploadFile = new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: blob.type || "image/jpeg",
    });
    formData.append("file", uploadFile);

    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.url) {
        return data.url;
      }
    }
  } catch (err) {
    console.warn("Falha ao enviar para Convex Storage, usando fallback:", err);
  }

  return dataUrl;
}
