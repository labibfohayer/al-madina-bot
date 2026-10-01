const axios = require('axios');
const APP_ID = '29228826773392220';
const APP_SECRET = '93ca0f8d11577a27c8932b544b75dcda';
const PAGE_TOKEN = 'EAGfXdo0Hi1wBShZCXIp5fkcdczBi831U3xyZCxKZAZBXwTvCiB5yzjaA2hzG4ZC2VRuOoYBZBRFkLF0zhfYpDG3f8eISvbGo5CZCTA4HZBEqwvFOZCXrDk0Xd5yZAnXrSrEZC97HUAMfQlvhZCQAnm9KTIVvQt9ejeu0LwqS9HvU3xzmd9HP8KmwZBSaXGwX2WKfhZCyplGsizrXsA4TuRsG3SRC3cgPiRXdKmTlQ3ZA048enBpd26BLy46jDDNTVgrZAQZDZD';
axios.get(`https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${PAGE_TOKEN}`)
    .then(res => console.log(res.data))
    .catch(err => console.log(err.response.data));
