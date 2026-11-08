import { Resvg } from "@resvg/resvg-js";
import { readFile, writeFile } from "node:fs/promises";

const source = await readFile(new URL("../public/icon.svg", import.meta.url));
for (const [name, width] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
]) {
  const image = new Resvg(source, { fitTo: { mode: "width", value: width } })
    .render()
    .asPng();
  await writeFile(new URL(`../public/${name}`, import.meta.url), image);
}
