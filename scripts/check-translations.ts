/**
 * Translation Key Checker and Sorter
 *
 * This script:
 * 1. Checks for missing translation keys across all locale files
 * 2. Sorts all translations alphabetically by key
 *
 * Exit codes:
 * - 0: Success (no missing keys, files may have been sorted)
 * - 1: Error (missing keys found)
 *
 * Usage: npx ts-node scripts/check-translations.ts
 * Or with bun: bun scripts/check-translations.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const LOCALES_DIR = path.join(__dirname, '../src/renderer/src/i18n/locales');
const REFERENCE_LOCALE = 'en.json'; // English is the reference locale

interface TranslationObject {
  [key: string]: string | TranslationObject;
}

/**
 * Recursively get all keys from a translation object with dot notation
 */
function getAllKeys(obj: TranslationObject, prefix = ''): string[] {
  const keys: string[] = [];

  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    if (typeof value === 'object' && value !== null) {
      keys.push(...getAllKeys(value as TranslationObject, fullKey));
    } else {
      keys.push(fullKey);
    }
  }

  return keys;
}

/**
 * Check if a key exists in the translation object
 */
function hasKey(obj: TranslationObject, keyPath: string): boolean {
  const parts = keyPath.split('.');
  let current: TranslationObject | string = obj;

  for (const part of parts) {
    if (typeof current !== 'object' || current === null || !(part in current)) {
      return false;
    }
    current = current[part];
  }

  return true;
}

/**
 * Sort an object recursively by keys
 */
function sortObjectByKeys(obj: TranslationObject): TranslationObject {
  const sorted: TranslationObject = {};
  const keys = Object.keys(obj).sort((a, b) => a.localeCompare(b));

  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'object' && value !== null) {
      sorted[key] = sortObjectByKeys(value as TranslationObject);
    } else {
      sorted[key] = value;
    }
  }

  return sorted;
}

/**
 * Main function
 */
async function main(): Promise<void> {
  console.log('🔍 Translation Key Checker and Sorter\n');
  console.log('='.repeat(50));

  // Get all locale files
  const localeFiles = fs.readdirSync(LOCALES_DIR).filter(f => f.endsWith('.json'));

  if (!localeFiles.includes(REFERENCE_LOCALE)) {
    console.error(`❌ Reference locale ${REFERENCE_LOCALE} not found!`);
    process.exit(1);
  }

  // Load reference locale
  const referencePath = path.join(LOCALES_DIR, REFERENCE_LOCALE);
  const referenceData: TranslationObject = JSON.parse(fs.readFileSync(referencePath, 'utf-8'));
  const referenceKeys = getAllKeys(referenceData);

  console.log(`\n📋 Reference locale: ${REFERENCE_LOCALE}`);
  console.log(`   Total keys: ${referenceKeys.length}\n`);

  let hasErrors = false;
  const missingKeysReport: { [locale: string]: string[] } = {};
  const extraKeysReport: { [locale: string]: string[] } = {};
  const modifiedFiles: string[] = [];

  // Check each locale file
  for (const localeFile of localeFiles) {
    const localePath = path.join(LOCALES_DIR, localeFile);
    const originalContent = fs.readFileSync(localePath, 'utf-8');
    const localeData: TranslationObject = JSON.parse(originalContent);
    const localeKeys = getAllKeys(localeData);

    // Find missing keys (in reference but not in this locale)
    const missingKeys = referenceKeys.filter(key => !hasKey(localeData, key));

    // Find extra keys (in this locale but not in reference)
    const extraKeys = localeKeys.filter(key => !hasKey(referenceData, key));

    if (missingKeys.length > 0) {
      missingKeysReport[localeFile] = missingKeys;
      hasErrors = true;
    }

    if (extraKeys.length > 0) {
      extraKeysReport[localeFile] = extraKeys;
    }

    // Sort and save the locale file
    const sortedData = sortObjectByKeys(localeData);
    const newContent = JSON.stringify(sortedData, null, 2) + '\n';

    // Only write if content changed
    if (newContent !== originalContent) {
      fs.writeFileSync(localePath, newContent, 'utf-8');
      modifiedFiles.push(localePath);
    }
  }

  // Report missing keys
  console.log('📊 Missing Keys Report:');
  console.log('-'.repeat(50));

  if (Object.keys(missingKeysReport).length === 0) {
    console.log('✅ All locales have all keys!\n');
  } else {
    for (const [locale, keys] of Object.entries(missingKeysReport)) {
      console.log(`\n❌ ${locale} is missing ${keys.length} key(s):`);
      for (const key of keys) {
        console.log(`   - ${key}`);
      }
    }
    console.log('');
  }

  // Report extra keys
  if (Object.keys(extraKeysReport).length > 0) {
    console.log('📊 Extra Keys Report (keys not in reference):');
    console.log('-'.repeat(50));

    for (const [locale, keys] of Object.entries(extraKeysReport)) {
      console.log(`\n⚠️  ${locale} has ${keys.length} extra key(s):`);
      for (const key of keys) {
        console.log(`   - ${key}`);
      }
    }
    console.log('');
  }

  // Report sorting
  console.log('📊 Sorting Report:');
  console.log('-'.repeat(50));
  if (modifiedFiles.length > 0) {
    console.log(`📝 ${modifiedFiles.length} file(s) were sorted:\n`);
    for (const file of modifiedFiles) {
      console.log(`   - ${path.relative(process.cwd(), file)}`);
    }
    // Output modified files for git add (one per line, prefixed with MODIFIED_FILE:)
    console.log('\n--- MODIFIED FILES ---');
    for (const file of modifiedFiles) {
      console.log(`MODIFIED_FILE:${file}`);
    }
    console.log('--- END MODIFIED FILES ---\n');
  } else {
    console.log('✅ All files were already sorted.\n');
  }

  // Summary
  console.log('='.repeat(50));
  console.log('📋 Summary:');
  console.log(`   Locales checked: ${localeFiles.length}`);
  console.log(`   Reference keys: ${referenceKeys.length}`);
  console.log(`   Missing keys: ${Object.values(missingKeysReport).reduce((a, b) => a + b.length, 0)}`);
  console.log(`   Extra keys: ${Object.values(extraKeysReport).reduce((a, b) => a + b.length, 0)}`);
  console.log(`   Files sorted: ${modifiedFiles.length}`);

  if (hasErrors) {
    console.log('\n⚠️  Some locales are missing translation keys. Please add them!');
    process.exit(1);
  } else {
    console.log('\n✅ All translations are complete and sorted!');
    process.exit(0);
  }
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
