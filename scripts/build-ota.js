#!/usr/bin/env node

/**
 * OTA Bundle Builder (with SHA-256 integrity hash)
 * 
 * Usage: node scripts/build-ota.js [version]
 * Example: node scripts/build-ota.js 1.0.5
 * 
 * Steps:
 * 1) Updates BUNDLE_VERSION in src/config/ota.ts
 * 2) Builds the Vite project (npm run build)
 * 3) Zips the dist/ folder
 * 4) Computes SHA-256 hash of the zip
 * 5) Outputs: ota-bundles/bundle-<version>.zip
 * 6) Prints the SQL INSERT with sha256 + size_bytes
 * 
 * After running this script:
 * 1. Upload the zip to Supabase Storage bucket 'ota-bundles'
 * 2. Run the printed SQL to publish the update
 * 3. Workers will receive the update on next app open!
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Get version from CLI args
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
    if (fs.existsSync(outputFile)) {
      fs.unlinkSync(outputFile);
    }
    execSync(`cd "${distDir}" && zip -r "${outputFile}" .`, { stdio: 'inherit' });
  } catch (e) {
    console.error('❌ Zip failed. Make sure "zip" command is available.');
    process.exit(1);
  }

  // Step 6: Compute SHA-256
  const fileBuffer = fs.readFileSync(outputFile);
  const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const sizeBytes = fileBuffer.length;
  const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);

  console.log(`\n✅ OTA bundle created successfully!`);
  console.log(`   📁 File: ${outputFile}`);
  console.log(`   📏 Size: ${sizeMB} MB (${sizeBytes} bytes)`);
  console.log(`   🔒 SHA-256: ${sha256}`);
  console.log(`   🏷️  Version: ${version}`);
  console.log(`\n📋 Next steps:`);
  console.log(`   1. Upload ${path.basename(outputFile)} to Supabase Storage bucket 'ota-bundles'`);
  console.log(`   2. Run this SQL to publish the update:\n`);
  console.log(`   INSERT INTO app_bundles (app_id, platform, channel, version, bundle_url, is_mandatory, message, sha256, size_bytes)`);
  console.log(`   VALUES ('worker', 'android', 'production', '${version}',`);
  console.log(`           'https://api.didisnow.com/storage/v1/object/public/ota-bundles/bundle-${version}.zip',`);
  console.log(`           false, 'Bug fixes and UI improvements',`);
  console.log(`           '${sha256}', ${sizeBytes});`);
  console.log('');
}

build();
