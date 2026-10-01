const axios = require('axios');
const fs = require('fs');

const APP_ID = '29228826773392220';
const APP_SECRET = '93ca0f8d11577a27c8932b544b75dcda';
const SHORT_LIVED_TOKEN = 'EAGfXdo0Hi1wBShZCXIp5fkcdczBi831U3xyZCxKZAZBXwTvCiB5yzjaA2hzG4ZC2VRuOoYBZBRFkLF0zhfYpDG3f8eISvbGo5CZCTA4HZBEqwvFOZCXrDk0Xd5yZAnXrSrEZC97HUAMfQlvhZCQAnm9KTIVvQt9ejeu0LwqS9HvU3xzmd9HP8KmwZBSaXGwX2WKfhZCyplGsizrXsA4TuRsG3SRC3cgPiRXdKmTlQ3ZA048enBpd26BLy46jDDNTVgrZAQZDZD';

async function run() {
    try {
        console.log('Step 1: Exchanging for Long-Lived User Token...');
        const res1 = await axios.get(`https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${SHORT_LIVED_TOKEN}`);
        
        const longLivedUserToken = res1.data.access_token;
        console.log('Success!');
        
        console.log('Step 2: Fetching Permissions...');
        const resPerms = await axios.get(`https://graph.facebook.com/v19.0/me/permissions?access_token=${longLivedUserToken}`);
        console.log(resPerms.data.data);
        
        console.log('Step 3: Fetching Never-Expiring Page Token...');
        const res2 = await axios.get(`https://graph.facebook.com/v19.0/me/accounts?access_token=${longLivedUserToken}`);
        
        const pageData = res2.data.data.find(page => page.id === '133929903140121');
        if (pageData) {
            const token = pageData.access_token;
            console.log('SUCCESS! Never-Expiring Token:', token);
            let env = fs.readFileSync('.env', 'utf8');
            env = env.replace(/META_PAGE_ACCESS_TOKEN=.*/, 'META_PAGE_ACCESS_TOKEN=' + token);
            fs.writeFileSync('.env', env);
        } else {
            console.log('Page not found.');
        }
    } catch(err) {
        console.error(err.response ? err.response.data : err.message);
    }
}
run();
