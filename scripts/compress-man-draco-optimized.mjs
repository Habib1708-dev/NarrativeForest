#!/usr/bin/env node
/**
 * Script to create a Draco-compressed version of man model with only idle and wave animations
 * Creates man_draco_optimized.glb
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, statSync, unlinkSync } from 'fs';
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const inputFile = join(projectRoot, 'public/models/man/man.glb');
const tempFile = join(projectRoot, 'public/models/man/man_draco_temp.glb');
const outputFile = join(projectRoot, 'public/models/man/man_draco_optimized.glb');

console.log('👤 Creating Draco-compressed Man model with optimized animations...\n');

// Check if input file exists
if (!existsSync(inputFile)) {
  console.error(`❌ Input file not found: ${inputFile}`);
  process.exit(1);
}

try {
  console.log(`📥 Input:  ${inputFile}`);
  console.log(`📤 Output: ${outputFile}\n`);

  // Step 1: Decompress if needed and remove unused animations first
  console.log('📖 Step 1: Processing model (decompress + remove animations)...');
  execSync(`gltf-transform copy "${inputFile}" "${tempFile}"`, {
    stdio: 'inherit',
    cwd: projectRoot
  });

  // Step 2: Remove unused animations
  console.log('\n🔍 Step 2: Removing unused animations...');
  const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
  const document = await io.read(tempFile);
  
  const animations = document.getRoot().listAnimations();
  console.log(`\n📋 Found ${animations.length} animations:`);
  
  const animationsToRemove = [];
  const animationsToKeep = [];
  
  animations.forEach((anim) => {
    const name = anim.getName();
    // Keep only: "CharacterArmature|Idle_Gun" and "CharacterArmature|Wave"
    const isMainIdle = name === 'CharacterArmature|Idle_Gun' || name === 'Gun_Idle';
    const isWave = name === 'CharacterArmature|Wave';
    
    if (isMainIdle || isWave) {
      animationsToKeep.push(name);
      console.log(`✅ Keeping: "${name}"`);
    } else {
      animationsToRemove.push(anim);
      console.log(`❌ Removing: "${name}"`);
    }
  });

  if (animationsToKeep.length > 0) {
    animationsToRemove.forEach((anim) => {
      anim.dispose();
    });
    console.log(`\n💾 Removed ${animationsToRemove.length} animations, keeping ${animationsToKeep.length}`);
  }

  // Step 3: Save intermediate file
  const tempOptimized = join(projectRoot, 'public/models/man/man_draco_temp_optimized.glb');
  await io.write(tempOptimized, document);

  // Step 4: Apply Draco compression
  console.log('\n⚙️  Step 3: Applying Draco compression...');
  execSync(`gltf-transform draco "${tempOptimized}" "${outputFile}"`, {
    stdio: 'inherit',
    cwd: projectRoot
  });

  // Clean up temp files
  if (existsSync(tempFile)) unlinkSync(tempFile);
  if (existsSync(tempOptimized)) unlinkSync(tempOptimized);

  // Get file sizes
  const inputStats = statSync(inputFile);
  const outputStats = statSync(outputFile);
  const inputSize = (inputStats.size / 1024).toFixed(2);
  const outputSize = (outputStats.size / 1024).toFixed(2);
  const reduction = ((1 - outputStats.size / inputStats.size) * 100).toFixed(1);

  console.log('\n✅ Draco compression with animation optimization complete!');
  console.log(`📦 Input size:  ${inputSize} KB`);
  console.log(`📦 Output size: ${outputSize} KB`);
  console.log(`📉 Size reduction: ${reduction}%`);
  console.log(`\n📁 New file: ${outputFile}`);
  
} catch (error) {
  console.error('\n❌ Failed:', error.message);
  if (error.stack) console.error(error.stack);
  process.exit(1);
}

