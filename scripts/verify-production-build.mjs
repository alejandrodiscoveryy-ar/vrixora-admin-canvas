import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const publicDir = path.join(root, ".output", "public");

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function fail(message) {
  console.error(`BUILD_GUARD_FAIL: ${message}`);
  process.exit(1);
}

if (!supabaseUrl) {
  fail("VITE_SUPABASE_URL no esta definida.");
}

if (!publishableKey) {
  fail("VITE_SUPABASE_PUBLISHABLE_KEY no esta definida.");
}

if (!publishableKey.startsWith("sb_publishable_")) {
  fail("La clave configurada no es una publishable key moderna.");
}

if (!fs.existsSync(publicDir)) {
  fail(".output/public no existe.");
}

const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(full);
      continue;
    }

    if (/\.(js|mjs|html)$/i.test(entry.name)) {
      files.push(full);
    }
  }
}

walk(publicDir);

const releaseProof = path.join(publicDir, "tuktuk-admin-release.json");
if (!fs.existsSync(releaseProof)) fail("No existe el identificador público de versión.");
const release = JSON.parse(fs.readFileSync(releaseProof, "utf8"));
if (release.release !== "tuktuk-modality-icons-v1") fail("Identificador de versión incorrecto.");
const hasApprovedIcons = files.some((file) => {
  const source = fs.readFileSync(file, "utf8");
  return source.includes("#c2410c") && source.includes("#4d7c0f") && source.includes("#7c3aed");
});
if (!hasApprovedIcons) fail("No están presentes los colores aprobados de modalidad.");
console.log("ADMIN_RELEASE_PROOF=" + release.release);

if (files.length === 0) {
  fail("No hay assets del navegador para comprobar.");
}

let hasUrl = false;
let hasKey = false;
let hasTrabajos = false;
let hasIntegraciones = false;
let hasElToque = false;
let hasMapas = false;

for (const file of files) {
  const content = fs.readFileSync(file, "utf8");

  if (content.includes(supabaseUrl)) hasUrl = true;
  if (content.includes(publishableKey)) hasKey = true;
  if (content.includes("Trabajos")) hasTrabajos = true;
  if (content.includes("Integraciones y API")) hasIntegraciones = true;
  if (content.includes("elTOQUE")) hasElToque = true;
  if (content.includes("Mapas y rutas")) hasMapas = true;
}

if (!hasUrl) fail("La URL Supabase no esta en el bundle del navegador.");
if (!hasKey) fail("La publishable key no esta en el bundle del navegador.");
if (!hasTrabajos) fail("Trabajos no esta en el bundle del navegador.");
if (!hasIntegraciones) fail("Integraciones no esta en el bundle del navegador.");
if (!hasElToque) fail("elTOQUE no esta en el bundle del navegador.");
if (!hasMapas) fail("Mapas y rutas no esta en el bundle del navegador.");

console.log("BUILD_GUARD=OK");
console.log("CLIENT_SUPABASE_URL=OK");
console.log("CLIENT_PUBLISHABLE_KEY=OK");
console.log("CLIENT_TRABAJOS=OK");
console.log("CLIENT_INTEGRACIONES=OK");
console.log("CLIENT_ELTOQUE=OK");
console.log("CLIENT_MAPAS=OK");
