import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const inputPath = path.join(__dirname, "worldcities_minimal.csv");
const outputPath = path.join(__dirname, "worldcities_mapped.json");

function latLngToSphere(latDeg, lngDeg) {
  const lat = (latDeg * Math.PI) / 180;
  const lng = (lngDeg * Math.PI) / 180;
  const cosLat = Math.cos(lat);
  return [
    +(Math.cos(lng) * cosLat).toFixed(6),
    +Math.sin(lat).toFixed(6),
    +(-Math.sin(lng) * cosLat).toFixed(6),
  ];
}

const raw = fs.readFileSync(inputPath, "utf8");
const lines = raw.split(/\r?\n/).filter(Boolean);
const rows = lines.slice(1);

let maxPopulation = 0;
const cities = [];

for (const line of rows) {
  const [city, latStr, lngStr, populationStr] = line.split(",");
  const lat = Number.parseFloat(latStr);
  const lng = Number.parseFloat(lngStr);
  const population = Number.parseInt(populationStr, 10);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(population)) {
    continue;
  }

  const [x, y, z] = latLngToSphere(lat, lng);
  maxPopulation = Math.max(maxPopulation, population);
  cities.push([city, x, y, z, population]);
}

const output = {
  radius: 1,
  minPopulation: 150000,
  maxPopulation,
  cities,
};

fs.writeFileSync(outputPath, JSON.stringify(output), "utf8");
console.log(`Wrote ${cities.length} mapped cities to worldcities_mapped.json`);
