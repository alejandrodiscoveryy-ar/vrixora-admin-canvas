import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const record = read("src/features/admin/MarketplaceDriver360Record.tsx");
const parent = read("src/features/admin/MarketplaceSection.tsx");
const api = read("src/lib/marketplace-map.ts");

test("360 portrait prefers uploaded photo, retries Google on image failure, then uses placeholder", () => {
  assert.match(record, /<ImageWithFallback[\s\S]*?url=\{media\?\.avatarUrl\}[\s\S]*?fallbackUrl=\{media\?\.googleAvatarUrl\}/);
  assert.match(record, /const \[failedUrls, setFailedUrls\] = useState<string\[\]>\(\[\]\)/);
  assert.match(record, /\[url, fallbackUrl\]\.find/);
  assert.match(record, /onError=\{\(\) => setFailedUrls/);
  assert.match(record, /useEffect\(\(\) => setFailedUrls\(\[\]\), \[url, fallbackUrl\]\)/);
  const avatar = record.split("function ImageWithFallback(")[1]?.split("function Fact(")[0] ?? "";
  assert.doesNotMatch(avatar, /currentTarget\.style\.display/);
});

test("360 media refreshes signed URLs, combines list and detail sources and retries errors", () => {
  assert.match(parent, /refetchInterval: driver360Id \? 12 \* 60_000 : false/);
  assert.match(parent, /const resolvedDriver360Media = useMemo/);
  assert.match(parent, /avatarUrl: selected\?\.avatarUrl \?\? directory\?\.avatarUrl/);
  assert.match(parent, /googleAvatarUrl: selected\?\.googleAvatarUrl \?\? directory\?\.googleAvatarUrl/);
  assert.match(parent, /media=\{resolvedDriver360Media\}/);
  assert.match(parent, /selectedDriverMedia\.isError/);
  assert.match(parent, /Reintentar foto/);
  assert.match(parent, /selectedDriverMedia\.refetch\(\)/);
  assert.match(api, /googleAvatarUrl: nullableString\(driver\.google_avatar_url\)/);
});
