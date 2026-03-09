/**
 * Converts all .tif and .tiff images in public/textures/earth/earth2 to .jpg.
 * Usage: node scripts/convert-tiff-to-jpg.js
 */

import { readdir, stat } from "fs/promises";
import { join, extname, basename, dirname } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EARTH2_DIR = join(__dirname, "..", "public", "textures", "earth", "earth2");

const TIFF_EXT = /\.tiff?$/i;

async function convertTiffToJpg(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const tiffFiles = entries.filter(
    (e) => e.isFile() && TIFF_EXT.test(e.name)
  );

  if (tiffFiles.length === 0) {
    console.log("No .tif/.tiff files found in", dir);
    return;
  }

  for (const file of tiffFiles) {
    const inputPath = join(dir, file.name);
    const base = basename(file.name, extname(file.name));
    const outputPath = join(dir, `${base}.jpg`);

    try {
      await sharp(inputPath)
        .jpeg({ quality: 90, mozjpeg: true })
        .toFile(outputPath);
      console.log("Converted:", file.name, "->", `${base}.jpg`);
    } catch (err) {
      console.error("Failed to convert", file.name, err.message);
    }
  }
}

convertTiffToJpg(EARTH2_DIR).catch((err) => {
  console.error(err);
  process.exit(1);
});
