import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const impulsa = read("src/features/admin/MarketplaceImpulsaCommunicationAnalytics.tsx");
const directory = read("src/features/admin/MarketplaceSection.tsx");
const gateway = read("src/lib/marketplace-map.ts");
const root = read("src/features/admin/ComercialSection.tsx");

test("Impulsa utiliza el mismo origen de imágenes privadas que Conductores", () => {
  assert.match(directory, /getMarketplaceDirectoryDriverMedia\(projectId, driverMediaIds\)/);
  assert.match(impulsa, /getMarketplaceDirectoryDriverMedia\(projectId,promoterIds\)/);
  assert.match(impulsa, /"marketplace-driver-directory-media",projectId,promoterIds/);
  assert.match(gateway, /DRIVER_DIRECTORY_MEDIA_BATCH_SIZE = 25/);
  assert.match(gateway, /operation: "driver_directory_media"/);
  assert.match(gateway, /googleAvatarUrl: nullableString\(driver\.google_avatar_url\)/);
  assert.doesNotMatch(impulsa, /\.from\("profiles"\)|\.from\("driver_profiles"\)/);
});

test("Cada tarjeta muestra foto real; ante error intenta Google y después iniciales", () => {
  assert.match(impulsa, /function ImpulsaDriverPortrait/);
  assert.match(impulsa, /const uploaded = media\?\.avatarUrl \?\? null/);
  assert.match(impulsa, /const google = media\?\.googleAvatarUrl \?\? null/);
  assert.match(impulsa, /\[uploaded, google\]\.find/);
  assert.match(impulsa, /const \[failedUrls, setFailedUrls\] = useState<string\[\]>\(\[\]\)/);
  assert.match(impulsa, /useEffect\(\(\) => setFailedUrls\(\[\]\), \[uploaded, google\]\)/);
  assert.match(impulsa, /onError=\{\(\) => setFailedUrls/);
  assert.match(impulsa, /className="absolute inset-0 h-full w-full object-cover"/);
  assert.match(impulsa, /loading="lazy" referrerPolicy="no-referrer"/);
  assert.match(impulsa, /alt=\{`Foto de \${name}`\}/);
  assert.match(impulsa, /<ImpulsaDriverPortrait name=\{x\.name\} media=\{photo\} \/>/);
  assert.match(impulsa, /rounded-full border border-cyan-400\/25/);
});

test("Fotos solo para administradores con permisos y URLs firmadas renovadas", () => {
  assert.match(root, /canManage=\{canManage && permissions\.includes\("marketplace\.view"\)\}/);
  assert.match(impulsa, /enabled:canManage && query\.isSuccess && promoterIds\.length>0/);
  assert.match(impulsa, /const photo=canManage \? driverMedia\.data\?\.\[x\.driver_user_id\] : undefined/);
  assert.match(impulsa, /staleTime:5\*60_000/);
  assert.match(impulsa, /refetchInterval:12\*60_000/);
  assert.match(impulsa, /driverMedia\.isError/);
  assert.match(impulsa, /Reintentar fotos/);
  assert.match(impulsa, /driverMedia\.refetch\(\)/);
});

test("No altera el diseño, las métricas, los detalles plegables ni WhatsApp", () => {
  assert.match(impulsa, /data-impulsa-expanded=\{open\?"true":"false"\}/);
  assert.match(impulsa, /aria-expanded=\{open\}/);
  assert.match(impulsa, /Captación y actividad del enlace/);
  assert.match(impulsa, /Solicitudes \/ clics registrados/);
  assert.match(impulsa, /driverWhatsAppLinks\(phone, x\.active \? impulsaGroupInviteMessage\(x\.name\) : undefined\)\?\.web/);
  assert.match(impulsa, /border-emerald-400\/25/);
});
