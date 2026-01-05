#!/usr/bin/env node
/**
 * Script to remove unused animations from man_ktx2.glb
 * Keeps only:
 * - Idle animation (Gun_Idle or any animation matching /gun.*idle|idle.*gun/i)
 * - Wave animation (CharacterArmature|Wave)
 * 
 * Strategy: Decompress first, then remove animations, then recompress
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

const inputFile = join(projectRoot, 'public/models/man/man_ktx2.glb');
const tempFile = join(projectRoot, 'public/models/man/man_ktx2_temp.glb');
const outputFile = join(projectRoot, 'public/models/man/man_ktx2_optimized.glb');

console.log('🎬 Removing unused animations from Man model...\n');

// Check if input file exists
if (!existsSync(inputFile)) {
  console.error(`❌ Input file not found: ${inputFile}`);
  process.exit(1);
}

try {
  console.log(`📥 Input:  ${inputFile}`);
  console.log(`📤 Output: ${outputFile}\n`);

  // Step 1: Decompress to remove meshopt compression
  console.log('📖 Step 1: Decompressing model...');
  execSync(`gltf-transform copy "${inputFile}" "${tempFile}"`, {
    stdio: 'inherit',
    cwd: projectRoot
  });

  // Step 2: Read decompressed model and remove animations
  console.log('\n🔍 Step 2: Analyzing and removing animations...');
  const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
  const document = await io.read(tempFile);
  
  // Get all animations
  const animations = document.getRoot().listAnimations();
  console.log(`\n📋 Found ${animations.length} animations:`);
  animations.forEach((anim, i) => {
    console.log(`  ${i + 1}. "${anim.getName()}"`);
  });

  // Define animations to keep
  // Keep only the main idle (Idle_Gun) and the wave animation
  const animationsToRemove = [];
  const animationsToKeep = [];
  
  animations.forEach((anim) => {
    const name = anim.getName();
    // Keep: "CharacterArmature|Idle_Gun" (main idle) and "CharacterArmature|Wave"
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

  if (animationsToKeep.length === 0) {
    console.warn('\n⚠️  Warning: No animations matched the keep criteria!');
    console.warn('   Keeping all animations to be safe.');
  } else {
    // Remove animations by disposing them
    // In gltf-transform, disposing an animation removes it from the document
    animationsToRemove.forEach((anim) => {
      anim.dispose();
    });
    
    console.log(`\n💾 Step 3: Saving optimized model with ${animationsToKeep.length} animations...`);
  }

  // Write the document
  await io.write(outputFile, document);

  // Clean up temp file
  if (existsSync(tempFile)) {
    unlinkSync(tempFile);
  }

  // Get file sizes
  const inputStats = statSync(inputFile);
  const outputStats = statSync(outputFile);
  const inputSize = (inputStats.size / 1024).toFixed(2);
  const outputSize = (outputStats.size / 1024).toFixed(2);
  const reduction = ((1 - outputStats.size / inputStats.size) * 100).toFixed(1);

  console.log('\n✅ Animation removal complete!');
  console.log(`📦 Input size:  ${inputSize} KB`);
  console.log(`📦 Output size: ${outputSize} KB`);
  if (parseFloat(reduction) > 0) {
    console.log(`📉 Size reduction: ${reduction}%`);
  }
  console.log(`\n📁 New file: ${outputFile}`);
  
} catch (error) {
  console.error('\n❌ Failed:', error.message);
  if (error.stack) console.error(error.stack);
  process.exit(1);
}
