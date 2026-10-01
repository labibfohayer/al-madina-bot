require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const systemPrompt = require('./systemPrompt');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generateReply(userMessage, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const chatPersona = "\n\n**গুরুত্বপূর্ণ নির্দেশিকা (PERSONA):** যে ব্যবহারকারী আপনার সাথে এখন চ্যাট করছেন, তিনি হলেন আপনার 'বস' (মাদ্রাসার পরিচালক বা অ্যাডমিন)। আপনি তার একান্ত বাধ্যগত, বিনয়ী এবং প্রফেশনাল সহকারী। তাকে অত্যন্ত সম্মান করে কথা বলবেন (যেমন: 'জ্বি বস', 'অবশ্যই বস', 'আপনার হুকুম মতো কাজ করছি')। বস যা প্রশ্ন করবেন, তার কোনো উল্টাপাল্টা বা লম্বা ভনিতা না করে সরাসরি, সঠিকভাবে এবং বসের নির্দেশ অনুযায়ী উত্তর দেবেন। বসের কথার অবাধ্য হওয়া যাবে না।";
            const model = genAI.getGenerativeModel({
                model: "gemini-3.5-flash-lite",
                systemInstruction: systemPrompt.MADRASA_INFO + chatPersona
            });

            const result = await model.generateContent(userMessage);
            const response = await result.response;
            return response.text();
        } catch (error) {
            console.error(`Error generating AI reply (Attempt ${attempt}):`, error.message);
            if (attempt === retries) {
                return "দুঃখিত বস, এই মুহূর্তে আমি সার্ভার সমস্যার কারণে উত্তর দিতে পারছি না। একটু পর আবার হুকুম করুন।";
            }
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

async function generateCommentReply(userComment, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const model = genAI.getGenerativeModel({
                model: "gemini-3.5-flash-lite", 
                systemInstruction: systemPrompt.MADRASA_INFO + "\n\n**বিশেষ নির্দেশিকা:** আপনি এখন ফেসবুক পেজের একটি পাবলিক কমেন্টের রিপ্লাই দিচ্ছেন। উত্তরটি হবে খুব ছোট (১-২ লাইন), আন্তরিক এবং সরাসরি। কমেন্টের রিপ্লাই এক ব্লকেই দেবেন (কোনো ||| বা খণ্ড ব্যবহার করবেন না)। কেউ আলহামদুলিল্লাহ বা মাশাআল্লাহ লিখলে সুন্দর করে জাযাকাল্লাহু খাইরান বলবেন।"
            });

            const result = await model.generateContent(userComment);
            const response = await result.response;
            return response.text().replace(/\|\|\|/g, ''); 
        } catch (error) {
            console.error(`Error generating comment reply (Attempt ${attempt}):`, error.message);
            if (attempt === retries) {
                return "আলহামদুলিল্লাহ, বিস্তারিত জানতে দয়া করে আমাদের পেজে ইনবক্স করুন অথবা 01712633264 নম্বরে কল করুন।";
            }
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

const fs = require('fs');

function fileToGenerativePart(filePath, mimeType) {
    return {
        inlineData: {
            data: Buffer.from(fs.readFileSync(filePath)).toString("base64"),
            mimeType
        },
    };
}

async function generatePostCaption(textContext, imagePath = null) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash-lite", generationConfig: { temperature: 0.9 } }); 
        
        const randomSeed = Math.floor(Math.random() * 10000);
        let prompt = `আপনি 'আল মদিনা মডেল মাদ্রাসা এন্ড রিসার্চ ইনস্টিটিউট'-এর অফিশিয়াল সোশ্যাল মিডিয়া ম্যানেজার। প্রদত্ত ছবি এবং/অথবা তথ্যের ওপর ভিত্তি করে ফেসবুকে পোস্ট করার জন্য একটি অত্যন্ত সুন্দর, আকর্ষণীয় ও ইসলামিক ভাবগাম্ভীর্যপূর্ণ ক্যাপশন তৈরি করুন (বাংলায়)।
        
**শর্তসমূহ:**
১. ক্যাপশনটি ১০০০ অক্ষরের মধ্যে হতে হবে।
২. ক্যাপশনের শুরুটা যেন প্রতিটি পোস্টে ভিন্ন হয়। একঘেয়েমি বা একই বাক্য বারবার ব্যবহার করবেন না। (Style Seed: ${randomSeed})
৩. ক্যাপশনের শেষে অবশ্যই এই ঠিকানা ও নম্বরটি যুক্ত করবেন: 
ঠিকানা: ক ৭৫/২, মহাখালী, দক্ষিণপাড়া, ঢাকা। মোবাইল: ০১৭১২৬৩৩২৬৪।
৪. শেষে প্রাসঙ্গিক হ্যাশট্যাগ ব্যবহার করবেন।`;

        if (textContext) {
             prompt += `\n\nপ্রদত্ত তথ্য: ${textContext}`;
        }
        
        let parts = [prompt];
        if (imagePath) {
            parts.push(fileToGenerativePart(imagePath, "image/jpeg"));
        }
        
        const result = await model.generateContent(parts);
        return result.response.text();
    } catch (error) {
        console.error("Error generating caption:", error);
        return "আলহামদুলিল্লাহ, আল মদিনা মডেল মাদ্রাসা এন্ড রিসার্চ ইনস্টিটিউটের আজকের সুন্দর একটি মুহূর্ত।\n\nঠিকানা: ক ৭৫/২, মহাখালী, দক্ষিণপাড়া, ঢাকা। মোবাইল: ০১৭১২৬৩৩২৬৪।\n\n#AlMadinaModelMadrasa";
    }
}

async function generateAutoPostContent(topic = "") {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash-lite", generationConfig: { temperature: 0.9 } }); 
        
        const subTopics = [
            "কুরআন তেলাওয়াতের ফজিলত", 
            "মাদ্রাসার ছাত্রদের নূরানী চেহারা ও জীবন", 
            "নামাজের গুরুত্ব ও শান্তি", 
            "ইসলামী শিষ্টাচার ও আদব", 
            "হাফেজদের সম্মান ও মর্যাদা", 
            "দ্বীন শিক্ষার গুরুত্ব", 
            "সকাল বেলার আমল ও বরকত", 
            "পিতামাতার হক ও ইসলাম", 
            "সদকায়ে জারিয়া হিসেবে মাদ্রাসায় দান", 
            "আখলাক বা সচ্চরিত্র",
            "হাদিসের সুন্দর একটি উপদেশ"
        ];
        const randomTopic = subTopics[Math.floor(Math.random() * subTopics.length)];
        
        let prompt = `আপনি 'আল মদিনা মডেল মাদ্রাসা এন্ড রিসার্চ ইনস্টিটিউট'-এর সোশ্যাল মিডিয়া ম্যানেজার। ফেসবুকে পোস্ট করার জন্য একটি আকর্ষণীয় ইসলামিক পোস্ট তৈরি করুন। `;
        
        if (topic) {
            prompt += `\nআজকের পোস্টের মূল বিষয়: ${topic}`;
        } else {
            prompt += `\nআজকের পোস্টের মূল বিষয়: "${randomTopic}"। এই বিষয়ের উপর ভিত্তি করে একটি সম্পূর্ণ নতুন ও ইউনিক পোস্ট লিখুন।`;
        }
        
        const randomSeed = Math.floor(Math.random() * 100000);
        
        prompt += `\n\n**শর্তসমূহ (অত্যন্ত গুরুত্বপূর্ণ):**
১. ক্যাপশনটি সুন্দর ও আকর্ষণীয় হতে হবে, কিন্তু ১০০০ অক্ষরের (characters) বেশি হওয়া যাবে না।
২. **কোনোভাবেই আগের কোনো পোস্টের মতো শুরু করবেন না। 'প্রযুক্তির ভিড়ে...', 'আধুনিকতার এই যুগে...' বা এই জাতীয় বাঁধা গৎ ব্যবহার করা সম্পূর্ণ নিষেধ! সরাসরি মূল বিষয় দিয়ে চমৎকারভাবে লেখা শুরু করবেন।** (Random Style Seed: ${randomSeed})
৩. ক্যাপশনের একদম শেষে অবশ্যই এই ঠিকানা এবং মোবাইল নম্বরটি হুবহু দিয়ে দেবেন:
ঠিকানা: ক ৭৫/২, মহাখালী, দক্ষিণপাড়া, ঢাকা। মোবাইল: ০১৭১২৬৩৩২৬৪।

আপনার আউটপুট অবশ্যই একটি JSON অবজেক্ট হতে হবে।
JSON ফরম্যাট:
{
    "caption": "আপনার লেখা সম্পূর্ণ নতুন ও ইউনিক বাংলা ক্যাপশন (ইমোজি, ঠিকানা ও হ্যাশট্যাগসহ)।",
    "searchQuery": "A search term (3-4 words) strictly focusing on madrasa kids or students studying Quran (e.g. 'madrasa boys reading quran', 'children studying quran madrasa', 'hifz students quran recitation', 'muslim children reading holy quran'). NEVER search for buildings, tombs, or non-madrasa topics."
}`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr);
    } catch (error) {
        console.error("Error generating auto post:", error);
        return {
            caption: "আলহামদুলিল্লাহ, আল মদিনা মডেল মাদ্রাসা এন্ড রিসার্চ ইনস্টিটিউটের আজকের সুন্দর একটি মুহূর্ত।\n\nঠিকানা: ক ৭৫/২, মহাখালী, দক্ষিণপাড়া, ঢাকা। মোবাইল: ০১৭১২৬৩৩২৬৪।\n\n#AlMadinaModelMadrasa #Madrasa",
            searchQuery: "beautiful madrasa quran"
        };
    }
}

module.exports = {
    generateReply,
    generateCommentReply,
    generatePostCaption,
    generateAutoPostContent
};
