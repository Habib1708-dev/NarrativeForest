import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const inputPath = path.join(__dirname, "worldcities.csv");
const outputPath = path.join(__dirname, "worldcities_minimal.csv");

function parseCsvRow(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && c === ",") {
      result.push(current);
      current = "";
      continue;
    }
    current += c;
  }
  result.push(current);
  return result;
}

const raw = fs.readFileSync(inputPath, "utf8");
const lines = raw.split(/\r?\n/).filter((l) => l.trim());
const header = lines[0];
const rows = lines.slice(1);

const MIN_POPULATION = 150000;
const out = ["city_ascii,lat,lng,population"];

for (const line of rows) {
  const cols = parseCsvRow(line);
  if (cols.length < 10) continue;
  const cityAscii = (cols[1] || "").replace(/"/g, "");
  const lat = (cols[2] || "").trim();
  const lng = (cols[3] || "").trim();
  const popStr = (cols[9] || "").trim();
  const population = parseInt(popStr, 10) || 0;
  if (population < MIN_POPULATION) continue;
  if (!lat || !lng) continue;
  out.push(`${cityAscii},${lat},${lng},${population}`);
}

fs.writeFileSync(outputPath, out.join("\n"), "utf8");
console.log(`Wrote ${out.length - 1} cities (pop >= ${MIN_POPULATION}) to worldcities_minimal.csv`);
