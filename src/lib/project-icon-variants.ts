export type ProjectIconVariant = {
  name: string;
  blob: Blob;
};

type VariantSpec = {
  name: string;
  size: number;
  contentScale: number;
  background?: string;
  monochrome?: boolean;
};

const VARIANT_SPECS: VariantSpec[] = [
  { name: "favicon-16.png", size: 16, contentScale: 0.84 },
  { name: "favicon-32.png", size: 32, contentScale: 0.84 },
  { name: "favicon-48.png", size: 48, contentScale: 0.84 },
  { name: "pwa-192.png", size: 192, contentScale: 0.8 },
  { name: "pwa-512.png", size: 512, contentScale: 0.8 },
  { name: "shortcut-96.png", size: 96, contentScale: 0.8 },
  { name: "shortcut-192.png", size: 192, contentScale: 0.8 },
  { name: "windows-44.png", size: 44, contentScale: 0.76 },
  { name: "windows-150.png", size: 150, contentScale: 0.76 },
  { name: "windows-310.png", size: 310, contentScale: 0.76 },
  { name: "notification-24.png", size: 24, contentScale: 0.72, monochrome: true },
  { name: "notification-48.png", size: 48, contentScale: 0.72, monochrome: true },
  { name: "notification-72.png", size: 72, contentScale: 0.72, monochrome: true },
  { name: "notification-96.png", size: 96, contentScale: 0.72, monochrome: true },
];

export const PROJECT_ICON_VARIANT_NAMES = [
  ...VARIANT_SPECS.map(({ name }) => name),
  "android-launcher-192.png",
  "maskable-192.png",
  "maskable-512.png",
  "apple-touch-180.png",
  "adaptive-foreground-432.png",
  "adaptive-background-432.png",
  "adaptive-monochrome-432.png",
  "round-192.png",
  "round-512.png",
] as const;

export type ProjectIconVariantName = (typeof PROJECT_ICON_VARIANT_NAMES)[number];

function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("No se pudo generar una variante PNG del icono maestro."));
    }, "image/png");
  });
}

async function loadImage(file: File) {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("No se pudo leer el icono maestro."));
      image.src = url;
    });
  } finally {
    // The decoded image remains usable after the object URL is revoked.
    URL.revokeObjectURL(url);
  }
}

function createCanvas(size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("El navegador no permite procesar el icono maestro.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  return { canvas, context };
}

function drawIdentity(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  size: number,
  contentScale: number,
) {
  const extent = Math.round(size * contentScale);
  const offset = Math.round((size - extent) / 2);
  context.drawImage(source, offset, offset, extent, extent);
}

async function renderVariant(
  source: CanvasImageSource,
  spec: VariantSpec,
): Promise<ProjectIconVariant> {
  const { canvas, context } = createCanvas(spec.size);
  if (spec.background) {
    context.fillStyle = spec.background;
    context.fillRect(0, 0, spec.size, spec.size);
  }
  if (spec.contentScale > 0) {
    drawIdentity(context, source, spec.size, spec.contentScale);
  }

  if (spec.monochrome) {
    const pixels = context.getImageData(0, 0, spec.size, spec.size);
    for (let index = 0; index < pixels.data.length; index += 4) {
      if (pixels.data[index + 3] > 0) {
        pixels.data[index] = 255;
        pixels.data[index + 1] = 255;
        pixels.data[index + 2] = 255;
      }
    }
    context.putImageData(pixels, 0, 0);
  }

  return { name: spec.name, blob: await canvasToPng(canvas) };
}

async function assertTransparentMaster(source: CanvasImageSource) {
  const { canvas, context } = createCanvas(128);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let hasTransparency = false;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] < 255) {
      hasTransparency = true;
      break;
    }
  }
  if (!hasTransparency) {
    throw new Error("El icono maestro debe conservar un fondo transparente.");
  }
}

export async function generateProjectIconVariants(file: File, backgroundColor: string) {
  const source = await loadImage(file);
  await assertTransparentMaster(source);

  const platformSpecs: VariantSpec[] = [
    {
      name: "android-launcher-192.png",
      size: 192,
      contentScale: 0.74,
      background: backgroundColor,
    },
    { name: "maskable-192.png", size: 192, contentScale: 0.64, background: backgroundColor },
    { name: "maskable-512.png", size: 512, contentScale: 0.64, background: backgroundColor },
    { name: "apple-touch-180.png", size: 180, contentScale: 0.7, background: backgroundColor },
    { name: "adaptive-foreground-432.png", size: 432, contentScale: 0.64 },
    {
      name: "adaptive-monochrome-432.png",
      size: 432,
      contentScale: 0.64,
      monochrome: true,
    },
    {
      name: "adaptive-background-432.png",
      size: 432,
      contentScale: 0,
      background: backgroundColor,
    },
    { name: "round-192.png", size: 192, contentScale: 0.6, background: backgroundColor },
    { name: "round-512.png", size: 512, contentScale: 0.6, background: backgroundColor },
  ];

  return Promise.all(
    [...VARIANT_SPECS, ...platformSpecs].map((spec) => renderVariant(source, spec)),
  );
}

export function projectIconVariantUrl(masterUrl: string, name: ProjectIconVariantName) {
  const match = masterUrl.match(/^(.*\/favicon-([0-9a-f-]{36}))\.png(?:\?.*)?$/i);
  return match ? `${match[1]}/${name}` : masterUrl;
}
