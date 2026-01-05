#!/usr/bin/env node
/**
 * Script to compress Radio tower.glb with Draco geometry compression
 * Creates Radio tower_draco.glb in the same directory
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const inputFile = join(projectRoot, 'public/models/radioTower/Radio tower.glb');
const outputFile = join(projectRoot, 'public/models/radioTower/Radio tower_draco.glb');

console.log('📡 Compressing Radio Tower model with Draco...\n');

// Check if input file exists
if (!existsSync(inputFile)) {
  console.error(`❌ Input file not found: ${inputFile}`);
  process.exit(1);
}

try {
  console.log(`📥 Input:  ${inputFile}`);
  console.log(`📤 Output: ${outputFile}\n`);
  
  // Use gltf-transform draco command for geometry compression
  const command = `gltf-transform draco "${inputFile}" "${outputFile}"`;
  
  console.log('⚙️  Running Draco compression...\n');
  execSync(command, { 
    stdio: 'inherit',
    cwd: projectRoot 
  });
  
  console.log('\n✅ Draco compression complete!');
  console.log(`📦 New file: ${outputFile}`);
  
} catch (error) {
  console.error('\n❌ Compression failed:', error.message);
  process.exit(1);
}

