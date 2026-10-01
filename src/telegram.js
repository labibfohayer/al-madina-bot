require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { generateReply, generatePostCaption, generateAutoPostContent } = require('./ai');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const cheerio = require('cheerio');

const VERIFIED_MADRASA_PHOTOS = [
    "https://img.freepik.com/premium-photo/group-muslim-children-studying-quran-madrasa_73046-516.jpg?w=2000",
    "https://img.freepik.com/premium-photo/group-muslim-children-studying-quran-madrasa_73046-585.jpg?w=2000",
    "https://as2.ftcdn.net/jpg/04/92/50/37/1000_F_492503769_ztGwXoBCfQDwmoCZ6CE9KVAydwk40AtC.jpg",
    "https://www.shutterstock.com/shutterstock/photos/2134069425/display_1500/stock-photo-group-of-a-children-reading-a-holy-book-quran-in-the-mosque-happy-muslim-family-muslim-girls-in-2134069425.jpg",
    "https://as2.ftcdn.net/jpg/04/92/50/39/1000_F_492503913_lnuH9KD5ZtC2lqOlnRXzy7Ubt7mnGvSA.jpg",
    "https://img.freepik.com/premium-photo/group-muslim-children-sitting-floor-inside-mosque-reading-quran-together-ramada_603656-4451.jpg?w=2000",
    "https://img.freepik.com/premium-photo/group-muslim-children-reading-koran-learning-about-islam-religion-mosque-together_603656-3972.jpg?w=1380",
    "https://img.freepik.com/premium-photo/group-children-girls-reads-holy-book-quran-inside-mosque_606562-258.jpg",
    "https://www.shutterstock.com/shutterstock/photos/2180511737/display_1500/stock-photo-a-muslim-teacher-teaches-a-group-of-children-girls-to-read-a-holy-book-quran-inside-the-mosque-2180511737.jpg",
    "https://img.freepik.com/premium-photo/group-muslim-children-reading-holy-books-quran-together-mosque_603656-4176.jpg?w=740",
    "https://img.freepik.com/premium-photo/muslim-children-reading-holy-quran-ramadan_1036975-24884.jpg?w=2000",
    "https://img.freepik.com/premium-photo/muslim-children-reading-holy-quran-ramadan_1036975-24942.jpg",
    "https://img.freepik.com/premium-photo/muslim-children-reading-holy-quran-ramadan_1036975-25582.jpg",
    "https://img.freepik.com/premium-photo/muslim-children-reading-holy-quran-ramadan_1036975-25389.jpg?w=2000",
    "https://img.freepik.com/premium-photo/muslim-children-reading-holy-quran-ramadan_1036975-25645.jpg?w=2000",
    "https://img.freepik.com/premium-photo/muslim-children-reading-holy-quran-ramadan_1036975-25880.jpg?w=900"
];

let lastImageIndex = -1;

function getRandomVerifiedMadrasaPhoto() {
    let nextIndex;
    do {
        nextIndex = Math.floor(Math.random() * VERIFIED_MADRASA_PHOTOS.length);
    } while (nextIndex === lastImageIndex && VERIFIED_MADRASA_PHOTOS.length > 1);
    lastImageIndex = nextIndex;
    return VERIFIED_MADRASA_PHOTOS[nextIndex];
}

async function getRealImage(query) {
    const badWords = ['transgender', 'logo', 'vector', 'clipart', 'icon', 'monument', 'tomb', 'ancient', 'poster', 'alamy.com', 'wikimedia', '.png'];
    try {
        const targetedQuery = 'muslim children reading quran madrasa ' + (query || '');
        const res = await axios.get('https://www.bing.com/images/search?q=' + encodeURIComponent(targetedQuery) + '&qft=+filterui:photo-photo', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 5000
        });
        const $ = cheerio.load(res.data);
        const validUrls = [];
        $('a.iusc').each((i, el) => {
            try {
                const m = JSON.parse($(el).attr('m'));
                if (m && m.murl) {
                    const u = m.murl.toLowerCase();
                    if (!badWords.some(w => u.includes(w)) && (u.includes('quran') || u.includes('madrasa') || u.includes('muslim') || u.includes('children') || u.includes('student'))) {
                        validUrls.push(m.murl);
                    }
                }
            } catch (e) {}
        });

        if (validUrls.length > 0) {
            const pick = validUrls[Math.floor(Math.random() * Math.min(validUrls.length, 10))];
            return pick;
        }
    } catch (e) {
        console.error("Live search notice:", e.message);
    }

    return getRandomVerifiedMadrasaPhoto();
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;
const bot = new TelegramBot(token, {polling: true});

console.log("Telegram Bot started! Waiting for messages...");

// In-memory store for pending posts
const pendingPosts = new Map();

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || msg.caption || '';
    
    console.log(`Received Telegram message from chatId: ${chatId}, text: ${text}`);

    // Command handling
    if(text === '/start') {
        bot.sendMessage(chatId, 'আসসালামু আলাইকুম! আলহামদুলিল্লাহ, আল মদিনা মডেল মাদ্রাসার অটোমেশন বট সফলভাবে চালু হয়েছে।\n\nফেসবুকে পোস্ট করতে চাইলে আমাকে যেকোনো ছবি/ভিডিও বা লেখা পাঠান। শুধু লেখা পোস্ট করতে চাইলে লিখুন: /post আপনার লেখা');
        return;
    }

    // Handle Photo Upload for Manual Posting
    if (msg.photo && msg.photo.length > 0) {
        bot.sendMessage(chatId, 'ছবি পেয়েছি! ফেসবুকে পোস্ট করার জন্য সুন্দর ক্যাপশন তৈরি করা হচ্ছে... ⏳');
        bot.sendChatAction(chatId, 'typing');
        
        try {
            // Get highest resolution photo
            const photoId = msg.photo[msg.photo.length - 1].file_id;
            const downloadDir = path.join(__dirname, '..', 'downloads');
            if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir);
            
            const filePath = await bot.downloadFile(photoId, downloadDir);
            
            // Generate caption with AI
            const caption = await generatePostCaption(text, filePath);
            
            // Store pending post
            pendingPosts.set(chatId, { type: 'photo', filePath, caption });
            
            // Send preview to user with inline keyboard
            const opts = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ ফেসবুকে পোস্ট করুন', callback_data: 'post_to_fb' }],
                        [{ text: '❌ বাতিল করুন', callback_data: 'cancel_post' }]
                    ]
                }
            };
            bot.sendMessage(chatId, `*আপনার পোস্টের ড্রাফট তৈরি হয়েছে:*\n\n${caption}`, {parse_mode: 'Markdown', ...opts});
            
        } catch (error) {
            console.error(error);
            bot.sendMessage(chatId, 'দুঃখিত, ছবি প্রসেস করতে বা ক্যাপশন তৈরি করতে সমস্যা হয়েছে।');
        }
        return;
    }

    // Handle normal text
    if (text) {
        // If it starts with /post, create a text-only post draft
        if (text.startsWith('/post')) {
            const topic = text.replace('/post', '').trim();
            bot.sendMessage(chatId, 'এআই দিয়ে ছবি ও ক্যাপশন তৈরি করা হচ্ছে, একটু সময় দিন... ⏳');
            bot.sendChatAction(chatId, 'upload_photo');
            
            try {
                const content = await generateAutoPostContent(topic);
                
                // Get a real HD image URL from Google/Bing
                let imageUrl = await getRealImage(content.searchQuery);
                
                // Download image
                const downloadDir = path.join(__dirname, '..', 'downloads');
                if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir);
                const filePath = path.join(downloadDir, 'generated_' + Date.now() + '.jpg');
                
                try {
                    const response = await axios({
                        url: imageUrl,
                        method: 'GET',
                        responseType: 'stream',
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
                    });
                    
                    const writer = fs.createWriteStream(filePath);
                    response.data.pipe(writer);
                    
                    await new Promise((resolve, reject) => {
                        writer.on('finish', resolve);
                        writer.on('error', reject);
                    });
                } catch (imgErr) {
                    console.error("Image download failed, using verified madrasa kids photo fallback.");
                    imageUrl = getRandomVerifiedMadrasaPhoto();
                    const response = await axios({ 
                        url: imageUrl, 
                        method: 'GET', 
                        responseType: 'stream',
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    });
                    const writer = fs.createWriteStream(filePath);
                    response.data.pipe(writer);
                    await new Promise((resolve, reject) => {
                        writer.on('finish', resolve);
                        writer.on('error', reject);
                    });
                }
                
                pendingPosts.set(chatId, { type: 'photo', filePath, caption: content.caption });
                
                const opts = {
                    caption: content.caption, // Using raw caption as AI is now restricted to 1000 chars
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '✅ ফেসবুকে পোস্ট করুন', callback_data: 'post_to_fb' }],
                            [{ text: '❌ বাতিল করুন', callback_data: 'cancel_post' }]
                        ]
                    }
                };
                
                bot.sendPhoto(chatId, filePath, opts).catch(err => {
                    console.error("Telegram sendPhoto error:", err);
                    bot.sendMessage(chatId, "ছবি পাঠানো সম্ভব হয়নি (হয়তো সাইজ বড়), তবে ড্রাফট রেডি! আপনি চাইলে পোস্ট করতে পারেন।", opts);
                });
            } catch (err) {
                console.error(err);
                bot.sendMessage(chatId, 'দুঃখিত বস, এআই পোস্ট তৈরি করতে ব্যর্থ হয়েছে।');
            }
            return;
        }

        // Otherwise, just chat with the bot
        bot.sendChatAction(chatId, 'typing');
        const reply = await generateReply(text);
        bot.sendMessage(chatId, reply);
    }
});

// Handle Callback Queries (Button Clicks)
bot.on('callback_query', async (query) => {
    const chatId = Number(query.message.chat.id);
    const action = query.data;
    
    console.log(`Button clicked! Action: ${action}, ChatID: ${chatId}`);
    
    // Always answer callback query to remove loading state on button
    bot.answerCallbackQuery(query.id).catch(console.error);
    
    if (action === 'cancel_post') {
        bot.deleteMessage(chatId, query.message.message_id).catch(console.error);
        bot.sendMessage(chatId, 'পোস্ট বাতিল করা হয়েছে। ❌');
        pendingPosts.delete(chatId);
    } 
    else if (action === 'post_to_fb') {
        let postData = pendingPosts.get(chatId) || pendingPosts.get(String(chatId));
        
        console.log(`Post Data found:`, !!postData);
        if (!postData) {
            bot.sendMessage(chatId, 'কোনো ড্রাফট পাওয়া যায়নি বা সেশন এক্সপায়ার হয়ে গেছে। দয়া করে আবার /post লিখুন।');
            return;
        }
        
        bot.sendMessage(chatId, 'ফেসবুকে পোস্ট করা হচ্ছে... ⏳').then(sentMsg => {
            const statusMsgId = sentMsg.message_id;
            
            (async () => {
                try {
                    if (postData.type === 'photo') {
                        const formData = new FormData();
                        formData.append('message', postData.caption);
                        formData.append('source', fs.createReadStream(postData.filePath));
                        
                        await axios.post(`https://graph.facebook.com/v19.0/me/photos?access_token=${PAGE_ACCESS_TOKEN}`, formData, {
                            headers: formData.getHeaders()
                        });
                    } else if (postData.type === 'text') {
                        await axios.post(`https://graph.facebook.com/v19.0/me/feed?access_token=${PAGE_ACCESS_TOKEN}`, {
                            message: postData.caption
                        });
                    }
                    
                    bot.deleteMessage(chatId, query.message.message_id); // delete the draft
                    bot.editMessageText('আলহামদুলিল্লাহ! আপনার পোস্ট সফলভাবে ফেসবুকে পাবলিশ হয়েছে। ✅', {
                        chat_id: chatId,
                        message_id: statusMsgId
                    });
                    pendingPosts.delete(chatId);
                    
                    // Clean up downloaded file
                    if (postData.filePath && fs.existsSync(postData.filePath)) {
                        fs.unlinkSync(postData.filePath);
                    }
                } catch (error) {
                    console.error('FB Post Error:', error.response ? error.response.data : error.message);
                    bot.editMessageText('দুঃখিত, ফেসবুকে পোস্ট করতে সমস্যা হয়েছে। এরর: ' + (error.response ? (error.response.data.error ? error.response.data.error.message : error.response.data) : error.message), {
                        chat_id: chatId,
                        message_id: statusMsgId
                    });
                }
            })();
        });
    }
});

const cron = require('node-cron');

const ADMIN_CHAT_ID = '8579253032';

// 5 Times a day (9am, 1pm, 4pm, 7pm, 9pm)
const scheduleTimes = ['0 9 * * *', '0 13 * * *', '0 16 * * *', '0 19 * * *', '0 21 * * *'];

async function sendScheduledPost() {
    bot.sendMessage(ADMIN_CHAT_ID, 'অটো-পোস্ট সিস্টেম: আপনার নতুন পোস্ট জেনারেট করা হচ্ছে... ⏳');
    bot.sendChatAction(ADMIN_CHAT_ID, 'upload_photo');
    
    try {
        const content = await generateAutoPostContent();
        let imageUrl = await getRealImage(content.searchQuery);
        
        const downloadDir = path.join(__dirname, '..', 'downloads');
        if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir);
        const filePath = path.join(downloadDir, 'cron_' + Date.now() + '.jpg');
        
        try {
            const response = await axios({ 
                url: imageUrl, 
                method: 'GET', 
                responseType: 'stream',
                headers: { 'User-Agent': 'Mozilla/5.0' } 
            });
            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
        } catch (imgErr) {
            console.error("Image download failed for cron, using verified madrasa kids photo fallback.");
            imageUrl = getRandomVerifiedMadrasaPhoto();
            const response = await axios({ 
                url: imageUrl, 
                method: 'GET', 
                responseType: 'stream',
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
        }
        
        pendingPosts.set(ADMIN_CHAT_ID, { type: 'photo', filePath, caption: content.caption });
        
        const opts = {
            caption: content.caption,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ ফেসবুকে পোস্ট করুন', callback_data: 'post_to_fb' }],
                    [{ text: '❌ বাতিল করুন', callback_data: 'cancel_post' }]
                ]
            }
        };
        bot.sendPhoto(ADMIN_CHAT_ID, filePath, opts).catch(err => {
            console.error("Telegram sendPhoto error in cron:", err);
            bot.sendMessage(ADMIN_CHAT_ID, "অটো-পোস্টের ছবি পাঠানো সম্ভব হয়নি, তবে ড্রাফট রেডি! আপনি চাইলে পোস্ট করতে পারেন।", opts);
        });
    } catch (err) {
        console.error("Cron Post Error:", err);
    }
}

scheduleTimes.forEach(time => {
    cron.schedule(time, sendScheduledPost, { timezone: "Asia/Dhaka" });
});

module.exports = bot;
