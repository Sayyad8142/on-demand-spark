#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const buildGradlePath = path.join(__dirname, '../android/app/build.gradle');

try {
  // Read the build.gradle file
  let content = fs.readFileSync(buildGradlePath, 'utf8');
  
  // Find and increment versionCode
  const versionCodeRegex = /versionCode\s+(\d+)/;
  const match = content.match(versionCodeRegex);
  
  if (match) {
    const currentVersion = parseInt(match[1]);
    const newVersion = currentVersion + 1;
    
    content = content.replace(versionCodeRegex, `versionCode ${newVersion}`);
    
    // Write back to file
    fs.writeFileSync(buildGradlePath, content, 'utf8');
    
    console.log(`✅ Version incremented: ${currentVersion} → ${newVersion}`);
    process.exit(0);
  } else {
    console.error('❌ Could not find versionCode in build.gradle');
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Error incrementing version:', error.message);
  process.exit(1);
}
