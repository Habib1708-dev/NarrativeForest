#!/usr/bin/env node
/**
 * Script to compress Spruce1.glb (no LOD tree) with KTX2/WebP texture compression
 * Creates Spruce1_ktx2.glb in the same directory
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const inputFile = join(projectRoot, 'public/models/tree/Spruce_Fir/Spruce1.glb');
const outputFile = join(projectRoot, 'public/models/tree/Spruce_Fir/Spruce1_ktx2.glb');

console.log('🌲 Compressing Spruce1 tree model with KTX2/WebP...\n');

// Check if input file exists
if (!existsSync(inputFile)) {
  console.error(`❌ Input file not found: ${inputFile}`);
  process.exit(1);
}

try {
  console.log(`📥 Input:  ${inputFile}`);
  console.log(`📤 Output: ${outputFile}\n`);
  
  // Use gltf-transform optimize with WebP compression
  const command = `gltf-transform optimize "${inputFile}" "${outputFile}" --texture-compress webp`;
  
  console.log('⚙️  Running compression...\n');
  execSync(command, { 
    stdio: 'inherit',
    cwd: projectRoot 
  });
  
  console.log('\n✅ KTX2 compression complete!');
  console.log(`📦 New file: ${outputFile}`);
  
} catch (error) {
  console.error('\n❌ Compression failed:', error.message);
  process.exit(1);
}

