require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { generateReply, generateCommentReply } = require('./ai');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;

// Ping Endpoint for UptimeRobot
app.get('/', (req, res) => {
    res.status(200).send("Al-Madina Bot is alive and running!");
});

// Webhook Verification
app.get('/webhook', (req, res) => {
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.status(400).send("Bad Request");
    }
});

// Receiving Messages and Comments
app.post('/webhook', async (req, res) => {
    let body = req.body;
    console.log("Incoming Webhook:", JSON.stringify(body, null, 2));

    if (body.object === 'page') {
        res.status(200).send('EVENT_RECEIVED');

        for (let entry of body.entry) {
            
            // 1. Handle Messenger Messages
            if (entry.messaging && entry.messaging[0]) {
                let webhook_event = entry.messaging[0];
                let sender_psid = webhook_event.sender.id;

                if (webhook_event.message && webhook_event.message.text) {
                    let userText = webhook_event.message.text;
                    console.log("Received message from Messenger:", userText);

                    const aiReply = await generateReply(userText);
                    const chunks = aiReply.split('|||').map(s => s.trim()).filter(s => s.length > 0);

                    for (let chunk of chunks) {
                        await sendMessengerReply(sender_psid, chunk);
                        await new Promise(r => setTimeout(r, 2500)); 
                    }
                }
            }

            // 2. Handle Public Comments (Feed)
            if (entry.changes) {
                for (let change of entry.changes) {
                    if (change.field === 'feed' && change.value.item === 'comment' && change.value.verb === 'add') {
                        let commentId = change.value.comment_id;
                        let commentText = change.value.message;
                        let senderId = change.value.from.id;
                        let pageId = entry.id; // The Page ID

                        // Skip if the page itself replied
                        if (senderId === pageId) continue;

                        console.log("Received comment:", commentText);

                        const aiReply = await generateCommentReply(commentText);
                        await sendCommentReply(commentId, aiReply);
                    }
                }
            }
        }
    } else {
        res.sendStatus(404);
    }
});

async function sendMessengerReply(sender_psid, responseText) {
    let request_body = {
        "recipient": { "id": sender_psid },
        "message": { "text": responseText }
    };

    try {
        await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, request_body);
        console.log("Reply sent successfully to Messenger!");
    } catch (error) {
        console.error("Unable to send message to Messenger:", error.response ? error.response.data : error.message);
    }
}

async function sendCommentReply(comment_id, responseText) {
    let request_body = { "message": responseText };

    try {
        await axios.post(`https://graph.facebook.com/v19.0/${comment_id}/comments?access_token=${PAGE_ACCESS_TOKEN}`, request_body);
        console.log("Comment reply sent successfully!");
    } catch (error) {
        console.error("Unable to send comment reply:", error.response ? error.response.data : error.message);
    }
}

// Polling Fallback for Comments
const fs = require('fs');
const path = require('path');
const REPLIED_COMMENTS_FILE = path.join(__dirname, '..', 'replied_comments.json');

let repliedComments = new Set();
if (fs.existsSync(REPLIED_COMMENTS_FILE)) {
    const data = fs.readFileSync(REPLIED_COMMENTS_FILE);
    repliedComments = new Set(JSON.parse(data));
}

function saveRepliedComments() {
    fs.writeFileSync(REPLIED_COMMENTS_FILE, JSON.stringify(Array.from(repliedComments)));
}

async function pollComments() {
    try {
        const res = await axios.get('https://graph.facebook.com/v19.0/me/posts?fields=comments{id,message,from,created_time}&access_token=' + PAGE_ACCESS_TOKEN);
        if (!res.data || !res.data.data) return;

        for (let post of res.data.data) {
            if (post.comments && post.comments.data) {
                for (let comment of post.comments.data) {
                    let commentId = comment.id;
                    let message = comment.message;
                    let senderId = comment.from ? comment.from.id : null;
                    
                    if (repliedComments.has(commentId)) continue;
                    
                    // Ignore self replies
                    if (message.includes('Assalamu') || message.includes('Al-Madina') || message.includes('ওয়ালাইকুম')) {
                        repliedComments.add(commentId);
                        saveRepliedComments();
                        continue;
                    }

                    console.log("New comment detected via polling:", message);
                    
                    try {
                        const aiReply = await generateCommentReply(message);
                        await sendCommentReply(commentId, aiReply);
                        repliedComments.add(commentId);
                        saveRepliedComments();
                    } catch (err) {
                        console.error("Failed to reply to polled comment:", err.message);
                    }
                }
            }
        }
    } catch (err) {
        // Suppress polling error logs to avoid spam
    }
}

// Poll every 10 seconds for comments
setInterval(pollComments, 10000);
console.log("Started comment polling fallback service...");

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// ==========================================
// Keep-Alive Self-Pinging Mechanism
// (Prevents Render Free Tier from Sleeping)
// ==========================================
const PING_INTERVAL = 9 * 60 * 1000; // 9 minutes (Render sleeps at 15 mins)
const SERVER_URL = process.env.RENDER_EXTERNAL_URL || 'https://al-madina-bot.onrender.com';

function selfPing() {
    axios.get(SERVER_URL)
        .then(() => {
            console.log(`[Keep-Alive] Ping successful: ${SERVER_URL} at ${new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Dhaka' })}`);
        })
        .catch(err => {
            console.log(`[Keep-Alive] Ping notice: ${err.message}`);
        });
}

// Start keep-alive ping loop
setInterval(selfPing, PING_INTERVAL);
// Initial ping 30 seconds after server launch
setTimeout(selfPing, 30 * 1000);
