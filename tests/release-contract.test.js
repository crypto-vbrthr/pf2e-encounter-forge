import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const moduleJson = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));
const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const constants = fs.readFileSync(new URL("../scripts/constants.js", import.meta.url), "utf8");

test("release metadata is version-aligned and manifest references project docs", () => {
  assert.equal(moduleJson.version, packageJson.version);
  assert.match(constants, new RegExp(`MODULE_VERSION = ["']${moduleJson.version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`));
  assert.equal(moduleJson.license, "LICENSE");
  assert.equal(moduleJson.readme, "README.md");
});

test("LICENSE and CHANGELOG ship with the module", () => {
  const license = fs.readFileSync(new URL("../LICENSE", import.meta.url), "utf8");
  const changelog = fs.readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
  assert.match(license, /^MIT License/m);
  assert.match(changelog, /0\.1\.0-alpha\.5/);
});

test("German and English localization catalogs expose the same keys", () => {
  const de = JSON.parse(fs.readFileSync(new URL("../lang/de.json", import.meta.url), "utf8"));
  const en = JSON.parse(fs.readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(de).sort(), Object.keys(en).sort());
});


test("localization catalogs contain no dotted-key prefix collisions", () => {
  for (const lang of ["de", "en"]) {
    const catalog = JSON.parse(fs.readFileSync(new URL(`../lang/${lang}.json`, import.meta.url), "utf8"));
    const keys = new Set(Object.keys(catalog));
    for (const key of keys) {
      const parts = key.split(".");
      for (let i = 1; i < parts.length; i += 1) {
        const prefix = parts.slice(0, i).join(".");
        assert.equal(keys.has(prefix), false, `${lang}: localization key '${prefix}' collides with nested key '${key}'`);
      }
    }
  }
});
