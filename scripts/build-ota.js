#!/usr/bin/env node

/**
 * OTA Bundle Builder
 * 
 * Usage: node scripts/build-ota.js [version]
 * Example: node scripts/build-ota.js 1.0.5
 * 
 * Steps:
 * 1) Builds the Vite project (npm run build)
 * 2) Zips the dist/ folder
 * 3) Outputs: ota-bundles/bundle-<version>.zip
 * 
 * After running this script:
 * 1. Upload the zip to Supabase Storage bucket 'ota-bundles'
 * 2. Insert a row in the `app_bundles` table:
 *    INSERT INTO app_bundles (app_id, platform, channel, version, bundle_url, is_mandatory, message)
 *    VALUES ('worker', 'android', 'production', '1.0.5', 
 *            'https://api.didisnow.com/storage/v1/object/public/ota-bundles/bundle-1.0.5.zip',
 *            false, 'Bug fixes and UI improvements');
 * 3. Workers will receive the update on next app open!
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createWriteStream } = require('fs');

// Get version from CLI args or from ota config
const version = process.argv[2];
if (!version) {
  console.error('❌ Usage: node scripts/build-ota.js <version>');
  console.error('   Example: node scripts/build-ota.js 1.0.5');
  process.exit(1);
}

// Validate version format
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('❌ Version must be in format X.Y.Z (e.g., 1.0.5)');
  process.exit(1);
}

const distDir = path.join(__dirname, '..', 'dist');
const outputDir = path.join(__dirname, '..', 'ota-bundles');
const outputFile = path.join(outputDir, `bundle-${version}.zip`);

async function build() {
  console.log(`\n📦 OTA Bundle Builder v${version}\n`);

  // Step 1: Update version in ota config
  const otaConfigPath = path.join(__dirname, '..', 'src', 'config', 'ota.ts');
  let otaConfig = fs.readFileSync(otaConfigPath, 'utf8');
  otaConfig = otaConfig.replace(
    /BUNDLE_VERSION:\s*'[^']*'/,
    `BUNDLE_VERSION: '${version}'`
  );
  fs.writeFileSync(otaConfigPath, otaConfig, 'utf8');
  console.log(`✅ Updated BUNDLE_VERSION to ${version}`);

  // Step 2: Build
  console.log('🔨 Building Vite project...');
  try {
    execSync('npm run build', { 
      stdio: 'inherit', 
      cwd: path.join(__dirname, '..') 
    });
  } catch (e) {
    console.error('❌ Build failed');
    process.exit(1);
  }

  // Step 3: Verify dist exists
  if (!fs.existsSync(distDir)) {
    console.error('❌ dist/ directory not found after build');
    process.exit(1);
  }

  // Step 4: Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Step 5: Zip the dist folder
  console.log('📦 Creating zip bundle...');
  try {
    // Remove old zip if exists
    if (fs.existsSync(outputFile)) {
      fs.unlinkSync(outputFile);
    }
    
    // Use system zip command (available on macOS/Linux)
    execSync(`cd "${distDir}" && zip -r "${outputFile}" .`, { stdio: 'inherit' });
  } catch (e) {
    console.error('❌ Zip failed. Make sure "zip" command is available.');
    console.error('   On macOS/Linux it should be pre-installed.');
    console.error('   On Windows, install via: choco install zip');
    process.exit(1);
  }

  const stats = fs.statSync(outputFile);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

  console.log(`\n✅ OTA bundle created successfully!`);
  console.log(`   📁 File: ${outputFile}`);
  console.log(`   📏 Size: ${sizeMB} MB`);
  console.log(`   🏷️  Version: ${version}`);
  console.log(`\n📋 Next steps:`);
  console.log(`   1. Upload ${path.basename(outputFile)} to Supabase Storage bucket 'ota-bundles'`);
  console.log(`   2. Run this SQL to publish the update:`);
  console.log(`\n   INSERT INTO app_bundles (app_id, platform, channel, version, bundle_url, is_mandatory, message)`);
  console.log(`   VALUES ('worker', 'android', 'production', '${version}',`);
  console.log(`           'https://api.didisnow.com/storage/v1/object/public/ota-bundles/bundle-${version}.zip',`);
  console.log(`           false, 'Bug fixes and UI improvements');`);
  console.log('');
}

build();
