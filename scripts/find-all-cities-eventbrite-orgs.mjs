/**
 * Find Valid Eventbrite Organization IDs for All Major Cities
 * 
 * This script searches Eventbrite's public pages for each city and finds organization IDs.
 * Since Eventbrite API only allows querying organizations we own, we'll find organizations
 * that exist (not 404) even if we can't query their events via API (403).
 * 
 * Usage:
 *   node scripts/find-all-cities-eventbrite-orgs.mjs --validate --update
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
try {
  const envPath = join(__dirname, '..', '.env.local');
  const envContent = readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
} catch (e) {
  // .env.local doesn't exist
}

const EVENTBRITE_API_TOKEN = process.env.VITE_EVENTBRITE_API_TOKEN || process.env.EVENTBRITE_API_TOKEN;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const CITIES = ['Berlin', 'London', 'New York', 'Los Angeles', 'Vancouver', 'Calgary', 'Tokyo'];
const KEYWORDS = ['music', 'nightlife', 'events', 'comedy', 'arts', 'sports', 'food'];

/**
 * Search Eventbrite public pages for organization IDs
 */
async function searchEventbritePages(city, keywords) {
  const foundOrgIds = new Set();
  
  for (const keyword of keywords) {
    try {
      const searchUrl = `https://www.eventbrite.com/d/${city.toLowerCase().replace(/\s+/g, '-')}--${keyword}/`;
      
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });
      
      if (!response.ok) continue;
      
      const html = await response.text();
      
      // Extract organization IDs
      const patterns = [
        /\/o\/[^\/]+\/(\d{8,15})/g,
        /organization[_-]?id["']:\s*["'](\d{8,15})["']/gi,
        /organizer[_-]?id["']:\s*["'](\d{8,15})["']/gi,
        /"org_id":\s*"(\d{8,15})"/g,
        /href=["']\/o\/[^\/]+\/(\d{8,15})/g,
      ];
      
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
          const id = match[1];
          if (id && id.length >= 8 && id.length <= 15) {
            foundOrgIds.add(id);
          }
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      // Continue on error
    }
  }
  
  return Array.from(foundOrgIds);
}

/**
 * Check if organization exists (404 = doesn't exist, 403 = exists but no access, 200 = exists and accessible)
 */
async function checkOrgExists(orgId) {
  try {
    let response;
    
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/eventbrite-proxy`;
      response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          organizationId: orgId,
          pageSize: 1,
          status: 'live',
        }),
      });
    } else if (EVENTBRITE_API_TOKEN) {
      const url = `https://www.eventbriteapi.com/v3/organizations/${orgId}/events/?token=${EVENTBRITE_API_TOKEN}&page_size=1&status=live`;
      response = await fetch(url);
    } else {
      return { exists: false, reason: 'No API access' };
    }
    
    // 404 = doesn't exist
    if (response.status === 404) {
      return { exists: false, reason: '404' };
    }
    
    // 403 = exists but we don't have access (this is OK - public events may exist)
    if (response.status === 403) {
      return { exists: true, accessible: false, reason: '403 - Exists but no API access' };
    }
    
    // 200 = exists and we have access
    if (response.ok) {
      const data = await response.json();
      const eventCount = data.pagination?.object_count || 0;
      return { exists: true, accessible: true, eventCount, reason: '200 - Accessible' };
    }
    
    return { exists: false, reason: `HTTP ${response.status}` };
  } catch (error) {
    return { exists: false, reason: error.message };
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const shouldValidate = args.includes('--validate');
  const shouldUpdate = args.includes('--update');
  const limitPerCity = args.includes('--limit') 
    ? parseInt(args[args.indexOf('--limit') + 1]) || 20
    : 50;
  
  console.log('\n🔍 Finding Eventbrite Organization IDs for All Cities\n');
  console.log(`Cities: ${CITIES.join(', ')}\n`);
  
  if (!EVENTBRITE_API_TOKEN && (!SUPABASE_URL || !SUPABASE_ANON_KEY)) {
    console.error('❌ Need EVENTBRITE_API_TOKEN or SUPABASE_URL + SUPABASE_ANON_KEY');
    process.exit(1);
  }
  
  const results = {};
  
  for (const city of CITIES) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔍 Processing ${city}...`);
    console.log('='.repeat(60));
    
    // Step 1: Search public pages
    console.log(`\n📄 Searching Eventbrite public pages...`);
    const foundIds = await searchEventbritePages(city, KEYWORDS);
    console.log(`   Found ${foundIds.length} potential organization IDs`);
    
    if (foundIds.length === 0) {
      console.log(`   ⚠️  No organization IDs found for ${city}`);
      results[city] = [];
      continue;
    }
    
    // Step 2: Validate if requested
    let validIds = [];
    if (shouldValidate) {
      console.log(`\n✅ Validating ${Math.min(foundIds.length, limitPerCity)} organization IDs...`);
      const idsToCheck = foundIds.slice(0, limitPerCity);
      
      for (let i = 0; i < idsToCheck.length; i++) {
        const orgId = idsToCheck[i];
        process.stdout.write(`   [${i + 1}/${idsToCheck.length}] ${orgId}... `);
        
        const result = await checkOrgExists(orgId);
        
        if (result.exists) {
          validIds.push(orgId);
          if (result.accessible) {
            console.log(`✅ Exists & accessible (${result.eventCount} events)`);
          } else {
            console.log(`✅ Exists (no API access, but public events may exist)`);
          }
        } else {
          console.log(`❌ ${result.reason}`);
        }
        
        if (i < idsToCheck.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }
    } else {
      // Without validation, use all found IDs
      validIds = foundIds.slice(0, limitPerCity);
      console.log(`\n   Using first ${validIds.length} organization IDs (not validated)`);
    }
    
    results[city] = validIds;
    console.log(`\n   ✅ ${validIds.length} valid organization IDs for ${city}`);
    
    // Delay between cities
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Summary
  console.log(`\n\n${'='.repeat(60)}`);
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  for (const [city, ids] of Object.entries(results)) {
    console.log(`${city}: ${ids.length} organization IDs`);
  }
  console.log('='.repeat(60));
  
  // Update file if requested
  if (shouldUpdate) {
    const filePath = join(__dirname, '..', 'services', 'eventbrite.ts');
    let content = readFileSync(filePath, 'utf-8');
    
    for (const [city, orgIds] of Object.entries(results)) {
      const cityPattern = new RegExp(`(['"])${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1:\\s*\\[[^\\]]*\\]`, 'g');
      const orgIdsStr = orgIds.length > 0 
        ? orgIds.map(id => `    '${id}'`).join(',\n')
        : '    // No valid organizations found';
      
      if (cityPattern.test(content)) {
        content = content.replace(cityPattern, `'${city}': [\n${orgIdsStr}\n  ]`);
      } else {
        // Add before closing brace
        const insertPoint = content.lastIndexOf('};');
        if (insertPoint !== -1) {
          content = content.substring(0, insertPoint) + 
                    `  '${city}': [\n${orgIdsStr}\n  ],\n` + 
                    content.substring(insertPoint);
        }
      }
    }
    
    writeFileSync(filePath, content, 'utf-8');
    console.log(`\n✅ Updated services/eventbrite.ts with organization IDs\n`);
  } else {
    console.log(`\n💡 Add --update flag to automatically update eventbrite.ts\n`);
  }
  
  console.log('\n⚠️  IMPORTANT NOTE:');
  console.log('   Eventbrite API only returns events for organizations owned by your token.');
  console.log('   Organizations that return 403 exist but you cannot query their events via API.');
  console.log('   To get events from other organizations, you would need:');
  console.log('   1. Their permission to access their organization');
  console.log('   2. OR use web scraping to get events from Eventbrite\'s public pages');
  console.log('   3. OR focus on organizations you own\n');
}

main().catch(console.error);
