#!/usr/bin/env node
/**
 * One-time Supabase setup script.
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and DATABASE_URL in .env
 * DATABASE_URL: Supabase Dashboard → Project Settings → Database → Connection string (URI)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl = process.env.DATABASE_URL;

  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  if (dbUrl && !dbUrl.includes('your-')) {
    const { Client } = require('pg');
    const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    const schema = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
    await client.connect();
    await client.query(schema);
    await client.end();
    console.log('✓ Database schema applied');
  } else {
    console.log('⚠ DATABASE_URL not set — run supabase/schema.sql manually in SQL Editor');
  }

  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.find(b => b.name === 'shop-images')) {
    const { error } = await supabase.storage.createBucket('shop-images', { public: true });
    if (error && !error.message.includes('already exists')) {
      console.error('Bucket creation failed:', error.message);
      console.log('  Create bucket "shop-images" (public) manually in Supabase Dashboard → Storage');
    } else {
      console.log('✓ Storage bucket "shop-images" created');
    }
  } else {
    console.log('✓ Storage bucket "shop-images" exists');
  }

  const shopData = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'data', 'shop-data.json'), 'utf8')
  );
  await supabase.from('shop_data').upsert({ id: 1, data: shopData });
  console.log('✓ Shop data seeded');

  const subscribers = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'data', 'subscribers.json'), 'utf8')
  );
  for (const sub of subscribers) {
    await supabase.from('subscribers').upsert({
      email: sub.email.toLowerCase(),
      code: sub.code,
      discount_percent: sub.discountPercent,
      subscribed_at: sub.subscribedAt,
      used: sub.used || false,
      revoked: false
    }, { onConflict: 'email' });
  }
  console.log(`✓ ${subscribers.length} subscriber(s) migrated`);

  console.log('\nSupabase setup complete.');
}

main().catch(err => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
