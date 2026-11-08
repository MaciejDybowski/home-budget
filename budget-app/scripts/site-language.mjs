import { baseParse } from "@vue/compiler-dom";
import { readFileSync } from "node:fs";

const ui = JSON.parse(
  readFileSync(new URL("../src/i18n/en.json", import.meta.url), "utf8"),
);
const site = JSON.parse(
  readFileSync(new URL("../site/en.json", import.meta.url), "utf8"),
);
const messages = { ...ui, ...site };
const text = (source) => {
  const key = source.replace(/\s+/g, " ").trim();
  if (messages[key]) return source.replace(source.trim(), messages[key]);
  if (/^\d[\d ]*,\d{2}$/.test(key))
    return source.replace(
      key,
      new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2 }).format(
        Number(key.replaceAll(" ", "").replace(",", ".")),
      ),
    );
  return source;
};
export function englishSite(source) {
  const edits = [];
  function walk(node) {
    const attribute = (name) =>
      node.props?.find((prop) => prop.type === 6 && prop.name === name)?.value
        ?.content;
    const navigationLanguage = attribute("data-language");
    if (navigationLanguage === "en" && !attribute("aria-current"))
      edits.push([
        node.loc.start.offset + node.tag.length + 1,
        node.loc.start.offset + node.tag.length + 1,
        ' aria-current="page"',
      ]);
    if (node.type === 2) {
      const translated = text(node.content);
      if (translated !== node.content)
        edits.push([node.loc.start.offset, node.loc.end.offset, translated]);
    }
    if (node.props)
      for (const prop of node.props) {
        if (
          prop.type === 6 &&
          prop.name === "aria-current" &&
          navigationLanguage === "pl"
        ) {
          edits.push([prop.loc.start.offset, prop.loc.end.offset, ""]);
          continue;
        }
        if (prop.type !== 6 || !prop.value) continue;
        const value = prop.value.content;
        let translated = value;
        if (
          ["aria-label", "placeholder", "title", "alt", "content"].includes(
            prop.name,
          )
        )
          translated = text(value);
        if (prop.name === "lang" && node.tag === "html") translated = "en";
        if (prop.name === "content" && value === "pl_PL") translated = "en_GB";
        if (prop.name === "href") {
          if (value.startsWith("./demo/"))
            translated =
              "../demo/?lang=en" +
              (value.includes("#") ? value.slice(value.indexOf("#")) : "");
          if (navigationLanguage === "en") translated = "./?lang=en";
          if (navigationLanguage === "pl") translated = "../?lang=pl";
          if (attribute("rel") === "canonical") translated = "__SITE_URL__en/";
          if (
            attribute("rel") === "alternate" &&
            attribute("hreflang") === "en"
          )
            translated = "__SITE_URL__en/";
          if (
            attribute("rel") === "alternate" &&
            ["pl", "x-default"].includes(attribute("hreflang"))
          )
            translated = "__SITE_URL__";
          if (value === "../public/icon.svg")
            translated = "../../public/icon.svg";
        }
        if (prop.name === "content" && attribute("property") === "og:url")
          translated = "__SITE_URL__en/";
        if (prop.name === "content" && attribute("property") === "og:image")
          translated = "__SITE_URL__social-preview-en.png";
        if (prop.name === "src" && value === "./media/home-desktop.png")
          translated = "../media/home-desktop-en.png";
        if (translated !== value)
          edits.push([
            prop.value.loc.start.offset,
            prop.value.loc.end.offset,
            '"' + translated.replaceAll('"', "&quot;") + '"',
          ]);
      }
    if (node.children) node.children.forEach(walk);
  }
  walk(baseParse(source));
  for (const [start, end, value] of edits.sort((a, b) => b[0] - a[0]))
    source = source.slice(0, start) + value + source.slice(end);
  return source;
}
