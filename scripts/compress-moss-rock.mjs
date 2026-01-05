#!/usr/bin/env node
/**
 * Script to compress MossRock.glb with KTX2/WebP texture compression
 * Creates MossRock_ktx2.glb in the same directory
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const inputFile = join(projectRoot, 'public/models/rocks/MossRock.glb');
const outputFile = join(projectRoot, 'public/models/rocks/MossRock_ktx2.glb');

console.log('🪨 Compressing MossRock model...\n');

// Check if input file exists
if (!existsSync(inputFile)) {
  console.error(`❌ Input file not found: ${inputFile}`);
  process.exit(1);
}

try {
  console.log(`📥 Input:  ${inputFile}`);
  console.log(`📤 Output: ${outputFile}\n`);
  
  // Use gltf-transform optimize with WebP compression (KTX2 requires KTX-Software)
  // This provides excellent compression and is widely supported
  const command = `gltf-transform optimize "${inputFile}" "${outputFile}" --texture-compress webp`;
  
  console.log('⚙️  Running compression...\n');
  execSync(command, { 
    stdio: 'inherit',
    cwd: projectRoot 
  });
  
  console.log('\n✅ Compression complete!');
  console.log(`📦 New file: ${outputFile}`);
  
} catch (error) {
  console.error('\n❌ Compression failed:', error.message);
  process.exit(1);
}

