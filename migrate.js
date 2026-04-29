import fs from 'node:fs';
import csv from 'csv-parser';
import { createClient } from '@supabase/supabase-js';

// 1. Configuration - Update these with your NEW project details
const SUPABASE_URL = 'https://tzmrarwmyvvsffxgqnox.supabase.co';
const SERVICE_ROLE_KEY = 'sb_secret_0OTpmAcWVuM8_UpO04Qptg_DjN6CYoD';
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function migrateUsers(filePath) {
    const users = [];

    // 2. Read and parse the CSV
    fs.createReadStream(filePath)
        .pipe(csv({ separator: ';' })) // Using the semicolon delimiter from your example
        .on('data', (row) => users.push(row))
        .on('end', async () => {
            console.log(`Found ${users.length} users. Starting migration...`);

            for (const user of users) {
                try {
                    // Parse the metadata JSON string
                    const metadata = user.raw_user_meta_data ? JSON.parse(user.raw_user_meta_data) : {};

                    const { data, error } = await supabase.auth.admin.createUser({
                        id: user.id, // Keeps the original ID so your foreign keys don't break
                        email: user.email,
                        password_hash: user.encrypted_password, // Injects the hash directly
                        user_metadata: metadata,
                        email_confirm: true // Prevents sending confirmation emails to everyone
                    });

                    if (error) {
                        console.error(`Error importing ${user.email}:`, error.message);
                    } else {
                        console.log(`Imported: ${user.email}`);
                    }
                } catch (parseError) {
                    console.error(`Failed to parse data for ${user.email}:`, parseError.message);
                }
            }
            console.log('Migration complete!');
        });
}

// Get the filename from the command line argument
const csvFile = process.argv[2];
if (!csvFile) {
    console.log('Usage: node migrate.js your_file.csv');
} else {
    migrateUsers(csvFile);
}
