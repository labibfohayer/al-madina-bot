const axios = require('axios');
const fs = require('fs');

const APP_ID = '29228826773392220';
const APP_SECRET = '93ca0f8d11577a27c8932b544b75dcda';
const SHORT_LIVED_TOKEN = 'EAGfXdo0Hi1wBShZCXIp5fkcdczBi831U3xyZCxKZAZBXwTvCiB5yzjaA2hzG4ZC2VRuOoYBZBRFkLF0zhfYpDG3f8eISvbGo5CZCTA4HZBEqwvFOZCXrDk0Xd5yZAnXrSrEZC97HUAMfQlvhZCQAnm9KTIVvQt9ejeu0LwqS9HvU3xzmd9HP8KmwZBSaXGwX2WKfhZCyplGsizrXsA4TuRsG3SRC3cgPiRXdKmTlQ3ZA048enBpd26BLy46jDDNTVgrZAQZDZD';

const inputToken = process.argv[2] || SHORT_LIVED_TOKEN;

async function run() {
    try {
        console.log('Step 1: Exchanging for Long-Lived User Token...');
        const res1 = await axios.get(`https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${inputToken}`);
        
        const longLivedUserToken = res1.data.access_token;
        console.log('✅ Step 1 Success! Obtained Long-Lived User Token.');
        
        console.log('\nStep 2: Fetching Permissions...');
        const resPerms = await axios.get(`https://graph.facebook.com/v19.0/me/permissions?access_token=${longLivedUserToken}`);
        const granted = resPerms.data.data.filter(p => p.status === 'granted').map(p => p.permission);
        console.log('Granted Permissions:', granted.join(', '));
        
        console.log('\nStep 3: Fetching Page Token...');
        const res2 = await axios.get(`https://graph.facebook.com/v19.0/me/accounts?access_token=${longLivedUserToken}`);
        
        const pageData = res2.data.data.find(page => page.id === '133929903140121') || res2.data.data[0];
        if (pageData) {
            const pageToken = pageData.access_token;
            console.log(`\n🎉 SUCCESS! Page Found: "${pageData.name}" (ID: ${pageData.id})`);
            console.log('================================================================');
            console.log('PERMANENT PAGE ACCESS TOKEN:');
            console.log(pageToken);
            console.log('================================================================');

            // Step 4: Automatically subscribe the page to Webhooks
            console.log('\nStep 4: Subscribing Page to Webhooks (messages, messaging_postbacks, feed)...');
            try {
                const subRes = await axios.post(`https://graph.facebook.com/v19.0/${pageData.id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,feed&access_token=${pageToken}`);
                console.log('✅ Page Subscribed to Webhook successfully:', subRes.data);
            } catch (subErr) {
                console.error('⚠️ Could not auto-subscribe page to webhook:', subErr.response ? subErr.response.data : subErr.message);
            }

            if (fs.existsSync('.env')) {
                let env = fs.readFileSync('.env', 'utf8');
                if (env.includes('META_PAGE_ACCESS_TOKEN=')) {
                    env = env.replace(/META_PAGE_ACCESS_TOKEN=.*/, 'META_PAGE_ACCESS_TOKEN=' + pageToken);
                } else {
                    env += '\nMETA_PAGE_ACCESS_TOKEN=' + pageToken;
                }
                fs.writeFileSync('.env', env);
                console.log('✅ Updated .env file locally with the new token.');
            }
        } else {
            console.log('❌ Page not found in your account. Available pages:');
            res2.data.data.forEach(p => console.log(`- ${p.name} (ID: ${p.id})`));
        }
    } catch(err) {
        console.error('❌ Error:', err.response ? err.response.data : err.message);
    }
}
run();
