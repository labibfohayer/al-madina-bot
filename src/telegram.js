require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { generateReply, generatePostCaption, generateAutoPostContent } = require('./ai');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const cheerio = require('cheerio');

async function getRealImage(query) {
    try {
        const res = await axios.get('https://www.bing.com/images/search?q=' + encodeURIComponent(query));
        const $ = cheerio.load(res.data);
        const urls = [];
        $('a.iusc').each((i, el) => {
            const m = $(el).attr('m');
            if (m) {
                try {
                    const data = JSON.parse(m);
                    if (data.murl) urls.push(data.murl);
                } catch (e) {}
            }
        });
        if (urls.length > 0) {
            // Pick a random image from top 40 to ensure it is always fresh and unique
            const max = Math.min(urls.length, 40);
            const index = Math.floor(Math.random() * max);
            return urls[index];
        }
    } catch (e) {
        console.error("Bing Scrape error", e.message);
    }
    return 'https://upload.wikimedia.org/wikipedia/commons/2/2f/Sirajul_Islam_Madrasa.jpg'; // fallback
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
                    console.error("Image download failed, using fallback.");
                    imageUrl = 'https://upload.wikimedia.org/wikipedia/commons/2/2f/Sirajul_Islam_Madrasa.jpg';
                    const response = await axios({ url: imageUrl, method: 'GET', responseType: 'stream' });
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
            console.error("Image download failed for cron, using fallback.");
            imageUrl = 'https://upload.wikimedia.org/wikipedia/commons/2/2f/Sirajul_Islam_Madrasa.jpg';
            const response = await axios({ url: imageUrl, method: 'GET', responseType: 'stream' });
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
