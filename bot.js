// -----------------------------------------------------------------
// Part 1: Setup, Helpers, and Owner Commands
// -----------------------------------------------------------------
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const moment = require('moment-timezone');

// --- Initialization ---
const token = process.env.TELEGRAM_BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const botOwnerId = parseInt(process.env.BOT_OWNER_ID);

const bot = new TelegramBot(token, { polling: true });
const supabase = createClient(supabaseUrl, supabaseKey);

// Myanmar Timezone
const MYANMAR_TZ = "Asia/Yangon";

// --- Plan Details (Object for easy access) ---
const plans = {
    '1Month': { name: '1Month', days: 28, coins: 2, price: 17000 },
    '3Months': { name: '3Months', days: 84, coins: 6, price: 45000 },
    '6Months': { name: '6Months', days: 168, coins: 13, price: 81000 },
    '12Months': { name: '12Months', days: 336, coins: 26, price: 149000 }
};

const paymentDetails = {
    'WavePay': 'Name: Ko Ko Thar Htet\nPhNo.: 09753661355',
    'KBZPay': 'Name: Ko Ko Thar Htet\nPhNo.: 09427275188',
    'AYAPay': 'Name: Ko Ko Thar Htet\nPhNo.: 09427275188',
    'UABPay': 'Name: Ko Ko Thar Htet\nPhNo.: 09753661355'
};

// --- Helper Functions ---

// Get or Create User
async function getUser(tgId, firstName, username) {
    let { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('tg_id', tgId)
        .single();

    if (error && error.code === 'PGRST116') { // PGRST116 = Not found
        const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert({ tg_id: tgId, first_name: firstName, username: username || 'N/A' })
            .select()
            .single();
        
        if (insertError) {
            console.error('Error creating user:', insertError);
            return null;
        }
        return { user: newUser, isNew: true };
    }
    return { user: data, isNew: false };
}

// Update User (Stage, Balance, etc.)
async function updateUser(tgId, updates) {
    const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('tg_id', tgId);
    if (error) console.error('Error updating user:', error);
    return data;
}

// Get/Set Bot Settings
async function getSetting(key) {
    const { data, error } = await supabase
        .from('bot_settings')
        .select('value')
        .eq('key', key)
        .single();
    return data ? data.value : null;
}

async function setSetting(key, value) {
    const { error } = await supabase
        .from('bot_settings')
        .update({ value: value })
        .eq('key', key);
    if (error) console.error('Error setting settings:', error);
}

// Format Myanmar Time
function formatMyanmarTime(date = new Date()) {
    return moment(date).tz(MYANMAR_TZ).format("HH:mm:ss DD/MM/YY");
}

// Check if user is Admin in the group
let adminCache = { timestamp: 0, admins: [] };
async function isChatAdmin(chatId, userId) {
    // Cache for 5 minutes to avoid API spam
    const now = Date.now();
    if (now - adminCache.timestamp > 300000 || adminCache.chatId !== chatId) {
        try {
            const admins = await bot.getChatAdministrators(chatId);
            adminCache = { timestamp: now, admins: admins.map(a => a.user.id), chatId: chatId };
        } catch (e) {
            console.error("Failed to get chat admins:", e.message);
            return false;
        }
    }
    return adminCache.admins.includes(userId);
}

// --- Reusable Start Menu Function ---
async function showStartMenu(chatId, from, messageId = null) {
    const { user } = await getUser(from.id, from.first_name, from.username);
    if (!user) return;

    await updateUser(from.id, { stage: 'stage_1', temp_data: {} });

    const welcomeMsg = `
မင်္ဂလာပါ၊ [${user.first_name}]။
@KoKos_Daily_Dose_of_Madness ရဲ့ Zoom Bot မှကြိုဆိုပါတယ်။

Zoom Pro ဝယ်ယူရန်အတွက် (ဝယ်ယူရန်)ကိုနှိပ်ပေးပါ။
    `;
    const inline_keyboard = [[
        { text: "Zoom Pro ဝယ်ယူရန်", callback_data: "buy_zoom_prompt" }
    ]];

    if (messageId) {
        // Edit existing message (from Back button)
        try {
            await bot.editMessageText(welcomeMsg, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: { inline_keyboard }
            });
        } catch (e) {
            // If edit fails (e.g., message not text), send new
            await bot.sendMessage(chatId, welcomeMsg, {
                reply_markup: { inline_keyboard }
            });
        }
    } else {
        // Send new message
        await bot.sendMessage(chatId, welcomeMsg, {
            reply_markup: { inline_keyboard }
        });
    }
}


// --- Owner Commands ---
// Helper for setting topic/group IDs
async function handleSetCommand(msg, key, settingName) {
    if (msg.from.id !== botOwnerId) return;
    const parts = msg.text.split(' ');
    const id = parts[1];

    if (!id) {
        bot.sendMessage(msg.chat.id, `Please provide an ID. Usage: /${key} [id]`);
        return;
    }

    await setSetting(key, id);
    bot.sendMessage(msg.chat.id, `${settingName} has been set to ${id}.`);
}

bot.onText(/\/connectgp (.+)/, (msg, match) => {
    handleSetCommand(msg, 'group_id', 'Connected Group ID');
});

bot.onText(/\/newcus (.+)/, (msg, match) => {
    handleSetCommand(msg, 'new_customer_topic_id', 'New Customer Topic ID');
});

bot.onText(/\/order (.+)/, (msg, match) => {
    handleSetCommand(msg, 'order_topic_id', 'Order Topic ID');
});

bot.onText(/\/orderfinished (.+)/, (msg, match) => {
    handleSetCommand(msg, 'order_finished_topic_id', 'Order Finished Topic ID');
});

bot.onText(/\/license (.+)/, (msg, match) => {
    handleSetCommand(msg, 'license_topic_id', 'License Topic ID');
});

bot.onText(/\/licensefinished (.+)/, (msg, match) => {
    handleSetCommand(msg, 'license_finished_topic_id', 'License Finished Topic ID');
});

bot.onText(/\/licenseexpired (.+)/, (msg, match) => {
    handleSetCommand(msg, 'license_expired_topic_id', 'Expired License Topic ID');
});

// Set Photo Command
bot.onText(/\/setphoto/, async (msg) => {
    if (msg.from.id !== botOwnerId) return;
    await updateUser(msg.from.id, { stage: 'awaiting_photo' });
    bot.sendMessage(msg.chat.id, "OK, Owner. Please send me the new promo photo.");
});

// --- User Commands ---

// /start command
bot.onText(/\/start/, async (msg) => {
    const tgId = msg.from.id;
    const { user, isNew } = await getUser(tgId, msg.from.first_name, msg.from.username);
    if (!user) return;

    // If new user, send alert
    if (isNew) {
        const groupId = await getSetting('group_id');
        const topicId = await getSetting('new_customer_topic_id');
        if (groupId && topicId) {
            const alertMsg = `
New Customer Alert
🚹: ${user.first_name}
👤: ${user.username ? `@${user.username}` : 'N/A'}
🔗: <a href="tg://user?id=${user.tg_id}">Link to Profile</a>
🆔: ${user.tg_id}
🗓️: ${formatMyanmarTime()}
            `;
            try {
                bot.sendMessage(groupId, alertMsg, {
                    parse_mode: 'HTML',
                    message_thread_id: topicId
                });
            } catch (e) { console.error("Error sending new customer alert:", e); }
        }
    }
    
    // Call the reusable start menu function
    await showStartMenu(msg.chat.id, msg.from);
});

// /balance command
bot.onText(/\/balance/, async (msg) => {
    const tgId = msg.from.id;
    const { user } = await getUser(tgId, msg.from.first_name, msg.from.username);
    if (!user) return;

    const balanceMsg = `
Zoom Coins 
🪙: ${user.coin_balance || 0} Coins

Zoom Coin ဝယ်ယူလိုပါက /start ကိုနှိပ်ပါ။
    `;
    bot.sendMessage(msg.chat.id, balanceMsg);
});

// /zoom command (Start license purchase)
bot.onText(/\/zoom/, async (msg) => {
    const tgId = msg.from.id;
    await updateUser(tgId, { stage: 'prompt_email', temp_data: {} });
    bot.sendMessage(msg.chat.id, "လူကြီးမင်း၏ emailအားပို့ပေးပါ။");
});


// -----------------------------------------------------------------
// Part 2: Message Handlers and Callback Query Logic
// -----------------------------------------------------------------

// --- General Message Handler (Text & Photo) ---
bot.on('message', async (msg) => {
    const tgId = msg.from.id;
    // Ignore commands (already handled by onText)
    if (msg.text && msg.text.startsWith('/')) return;

    const { user } = await getUser(tgId, msg.from.first_name, msg.from.username);
    if (!user) return;

    const stage = user.stage;

    // --- Photo Handler ---
    if (msg.photo) {
        if (stage === 'awaiting_photo') { // Owner setting promo photo
            if (tgId !== botOwnerId) return;
            const photoFileId = msg.photo[msg.photo.length - 1].file_id;
            await setSetting('promo_photo_file_id', photoFileId);
            await updateUser(tgId, { stage: 'start' });
            bot.sendMessage(tgId, "✅ Promo photo updated successfully!");
        } 
        else if (stage === 'awaiting_payment_proof') { // Customer sending screenshot
            const tempOrder = user.temp_data;
            if (!tempOrder || !tempOrder.plan) {
                bot.sendMessage(tgId, "An error occurred. Please start over with /start.");
                return;
            }

            bot.sendMessage(tgId, "သင့်၏ ပြေစာအားစစ်ဆေး‌နေပါသည်။။ ခတ္တခဏစောင့်ဆိုင်းပေးပါ။");
            
            // 1. Create order in DB
            const { data: newOrder, error } = await supabase
                .from('orders')
                .insert({
                    user_id: tgId,
                    plan_name: tempOrder.plan,
                    days: tempOrder.days,
                    coins: tempOrder.coins,
                    price: tempOrder.price,
                    status: 'pending'
                })
                .select()
                .single();

            if (error) {
                console.error("Error creating order:", error);
                bot.sendMessage(tgId, "Order တင်ရာတွင် အမှားအယွင်းဖြစ်သွားပါသည်။");
                return;
            }

            // 2. Send screenshot to admin group
            const groupId = await getSetting('group_id');
            const topicId = await getSetting('order_topic_id');
            if (!groupId || !topicId) {
                console.error("Order topic not set!");
                return;
            }

            const caption = `
Order (Pending)
🚹: ${user.first_name}
🔗: <a href="tg://user?id=${user.tg_id}">Link to Profile</a>
👤: ${user.username ? `@${user.username}` : 'N/A'}
🆔: ${user.tg_id}

Order Info
🛍️: ${tempOrder.plan}
🗓️: ${tempOrder.days} Days
🪙: ${tempOrder.coins} Coins
💰: ${tempOrder.price} ks
🗓️: ${formatMyanmarTime()} (Order Start)
            `;

            const inline_keyboard = [[
                { text: "✅ Accept", callback_data: `admin_accept_order:${tgId}:${newOrder.order_id}:${tempOrder.coins}` },
                { text: "❌ Decline", callback_data: `admin_decline_order:${tgId}:${newOrder.order_id}` }
            ]];

            try {
                const sentMsg = await bot.sendPhoto(groupId, msg.photo[0].file_id, {
                    caption: caption,
                    parse_mode: 'HTML',
                    message_thread_id: topicId,
                    reply_markup: { inline_keyboard }
                });
                
                // Save admin message_id to order table
                await supabase.from('orders').update({ payment_message_id: sentMsg.message_id }).eq('order_id', newOrder.order_id);

            } catch (e) { console.error("Error sending order to admin:", e); }

            // 3. Clear user stage
            await updateUser(tgId, { stage: 'start', temp_data: {} });
        }
    }
    // --- Text Handler ---
    else if (msg.text) {
        if (stage === 'prompt_email') {
            // Basic email validation
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(msg.text)) {
                bot.sendMessage(tgId, "Email format မမှန်ပါ။ Email အမှန်ကိုပြန်ပို့ပေးပါ။");
                return;
            }
            const email = msg.text.trim();
            
            const text = `
✉️: ${email}
ဝယ်ယူလိုသည့် Plan အားရွေးချယ်ပေးပါ။
            `;
            const inline_keyboard = [
                [
                    { text: "1Month", callback_data: `select_license:1Month` },
                    { text: "3Months", callback_data: `select_license:3Months` }
                ],
                [
                    { text: "6Months", callback_data: `select_license:6Months` },
                    { text: "12Months", callback_data: `select_license:12Months` }
                ],
                [ { text: "⬅️ Back", callback_data: "back_to_email_prompt" } ] // <-- ADDED BACK BUTTON
            ];
            
            // Save email to temp_data
            await updateUser(tgId, { stage: 'selecting_license_plan', temp_data: { email: email } });
            bot.sendMessage(tgId, text, { reply_markup: { inline_keyboard } });
        }
    }
});

// --- Callback Query Handler (Button Clicks) ---
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const tgId = callbackQuery.from.id;
    const data = callbackQuery.data;
    const chatType = msg.chat.type;

    const { user } = await getUser(tgId, callbackQuery.from.first_name, callbackQuery.from.username);
    if (!user) return bot.answerCallbackQuery(callbackQuery.id);

    // --- ADMIN-FACING BUTTONS (in group) ---
    if (chatType === 'supergroup' || chatType === 'group') {
        const groupId = await getSetting('group_id');
        if (msg.chat.id.toString() !== groupId) return bot.answerCallbackQuery(callbackQuery.id);

        const isAdmin = await isChatAdmin(msg.chat.id, tgId);
        if (!isAdmin) {
            return bot.answerCallbackQuery(callbackQuery.id, { text: "You are not an admin.", show_alert: true });
        }

        const [action, userIdStr, orderIdStr, ...rest] = data.split(':');
        const userId = parseInt(userIdStr);
        const orderId = parseInt(orderIdStr);

        try {
            if (action === 'admin_accept_order') {
                const coinsToAdd = parseInt(rest[0]);
                
                // 1. Update user balance
                await supabase.rpc('increment_coin_balance', { user_id_in: userId, coins_to_add: coinsToAdd });
                
                // 2. Update order status
                await supabase.from('orders').update({ status: 'accepted' }).eq('order_id', orderId);

                // 3. Edit message in order topic
                bot.editMessageCaption(msg.caption.replace("Order (Pending)", "Order (✅ Accepted)"), {
                    chat_id: msg.chat.id,
                    message_id: msg.message_id,
                    parse_mode: 'HTML',
                    reply_markup: { inline_keyboard: [] }
                });

                // 4. Forward to finished topic
                const finishedTopicId = await getSetting('order_finished_topic_id');
                if (finishedTopicId) {
                    bot.forwardMessage(msg.chat.id, msg.chat.id, msg.message_id, { message_thread_id: finishedTopicId });
                }
                
                // 5. Notify user
                const successMsg = `
Zoom Coin - [${coinsToAdd}] အားထည့်သွင်းပြီးပါပြီ။

ဝယ်ယူအားပေးမှုအတွက် အထူးကျေးဇူးတင်ရှ်ိပါသည်။

မိမိသူငယ်ချင်းများနှင့် မိတ်ဆွေ၊ မိသားစုများကိုလည်း လမ်းညွှန်ခြင်းဖြင့် ကျွန်ုပ်တို့အား ကူညီနိုင်ပါသည်။

ကျွန်တော်တို့၏ Telegram Channel
https://t.me/KoKos_Daily_Dose_of_Madness
                `;
                bot.sendMessage(userId, successMsg);
                
                const followUpMsg = "Zoom License ကိုဝယ်ယူလိုပါက (ဝယ်ယူရန်) ကိုနှိပ်ပေးပါ။";
                bot.sendMessage(userId, followUpMsg, {
                    reply_markup: {
                        inline_keyboard: [[ { text: "ဝယ်ယူရန်", callback_data: "buy_license_prompt" } ]]
                    }
                });
                
                bot.answerCallbackQuery(callbackQuery.id, { text: "Order Accepted!" });
            }
            else if (action === 'admin_decline_order') {
                // ... Handle decline logic (e.g., notify user) ...
                bot.editMessageCaption(msg.caption.replace("Order (Pending)", "Order (❌ Declined)"), {
                    chat_id: msg.chat.id,
                    message_id: msg.message_id,
                    parse_mode: 'HTML',
                    reply_markup: { inline_keyboard: [] }
                });
                bot.sendMessage(userId, "Your order has been declined. Please contact admin.");
                bot.answerCallbackQuery(callbackQuery.id, { text: "Order Declined!" });
            }
            else if (action === 'admin_finish_license') {
                const licenseId = parseInt(orderIdStr); // Reusing variable

                // 1. Update license status
                const { data: license } = await supabase.from('licenses').update({ status: 'active' }).eq('license_id', licenseId).select().single();
                if(!license) return bot.answerCallbackQuery(callbackQuery.id, { text: "License not found."});

                // 2. Edit message in topic
                bot.editMessageCaption(msg.caption.replace("Zoom License (Pending)", "Zoom License (✅ Finished)"), {
                    chat_id: msg.chat.id,
                    message_id: msg.message_id,
                    parse_mode: 'HTML',
                    reply_markup: { inline_keyboard: [] }
                });

                // 3. Forward to finished topic
                const finishedTopicId = await getSetting('license_finished_topic_id');
                if (finishedTopicId) {
                    bot.forwardMessage(msg.chat.id, msg.chat.id, msg.message_id, { message_thread_id: finishedTopicId });
                }

                // 5. Notify user
                const expiryDate = moment(license.expires_at).tz(MYANMAR_TZ).format("DD/MM/YYYY");
                const userMsg = `
Zoom License
✉️: ${license.email}
🛍️: ${license.plan_name}
🪙: ${license.coins_spent} Coin
🗓️: ${license.days} Days
Expire Date - ${expiryDate}
                `;
                bot.sendMessage(userId, userMsg);
                
                const followUp = `
ဝယ်ယူအားပေးမှုအတွက် အထူးကျေးဇူးတင်ရှ်ိပါသည်။

/balance ကိုနှိပ်ကာ Zoom Coin လက်ကျန်ကိုစစ်ဆေးနိုင်ပါတယ်။
/start ကိုနှိပ်ကာ Zoom Coin ကိုဝယ်ယူနိုင်ပါတယ်။
/zoom ကိုနှိပ်ကာ Zoom License ကိုဝယ်ယူနိုင်ပါတယ်

မိမိသူငယ်ချင်းများနှင့် မိတ်ဆွေ၊ မိသားစုများကိုလည်း လမ်းညွှန်ခြင်းဖြင့် ကျွန်ုပ်တို့အား ကူညီနိုင်ပါသည်။

ကျွန်တော်တို့၏ Telegram Channel
https://t.me/KoKos_Daily_Dose_of_Madness
                `;
                bot.sendMessage(userId, followUp);
                bot.answerCallbackQuery(callbackQuery.id, { text: "License Finished!" });
            }
            else if (action === 'admin_decline_license') {
                // ... Handle decline (refund coins, notify user) ...
                bot.answerCallbackQuery(callbackQuery.id, { text: "License Declined!" });
            }
        } catch (e) {
            console.error("Admin Callback Error:", e);
            bot.answerCallbackQuery(callbackQuery.id, { text: "An error occurred." });
        }
        return;
    }


    // --- USER-FACING BUTTONS (in private chat) ---
    try {
        if (data === 'buy_zoom_prompt') {
            await updateUser(tgId, { stage: 'stage_2_plans' });
            
            const photoFileId = await getSetting('promo_photo_file_id');
            if (!photoFileId) {
                bot.answerCallbackQuery(callbackQuery.id, { text: "Error: Photo not set by admin." });
                return;
            }

            // ** MODIFICATION: Combine text and photo into one message **
            const text = `
Zoom Pro ဝယ်ယူရာတွင် ကျွန်တော်တို့ဖက်မှ အကောင်းဆုံးဝန်ဆောင်မှုပေးထားပါတယ်ခင်ဗျာ။

<b>[Zoom Bot ကိုဘယ်လိုအသုံးပြုမလဲ။]</b>

လူကြီးမင်းအနေနဲ့ Zoom Coin အားအရင်ဝယ်ယူရပါမယ်ခင်ဗျ။ (Zoom Coin ၁ ခုလျှင် Zoom License အား 14 ရက်ကြာအသုံးပြုနိုင်ပါသည်။)

မိမိအသုံးပြုလိုသောနေ့တွင် ယခု Bot သို့ /zoom ဟုပေးပို့၍ အသုံးပြုနိုင်ပါသည်။

Coin 1 ခုလျှင် ၁၄ ရက်သာ Zoom License အားရရှိမည်ဖြစ်ပြီး မိမိထပ်မံ့အသုံးပြုလိုလျှင် အထက်တွင်ပြထားသည့်အတိုင်း ပြန်လည်ပြုလုပ်၍အသုံးပြုနိုင်ပါသည်။

Zoom Coin လက်ကျန်စစ်ဆေးလိုပါက /balance ဟုပေးပို့၍ စစ်ဆေးနိုင်ပါသည်။

Zoom Pro Pricing and Plan
            `;
            const inline_keyboard = [
                [
                    { text: "1Month", callback_data: "buy_coin:1Month" },
                    { text: "3Months", callback_data: "buy_coin:3Months" }
                ],
                [
                    { text: "6Months", callback_data: "buy_coin:6Months" },
                    { text: "12Months", callback_data: "buy_coin:12Months" }
                ],
                [ { text: "⬅️ Back", callback_data: "back_to_start" } ] // <-- Back button
            ];
            
            // Edit the original text message to become a photo message
            try {
                await bot.editMessageMedia({
                    type: 'photo',
                    media: photoFileId,
                    caption: text,
                    parse_mode: 'HTML'
                }, {
                    chat_id: msg.chat.id,
                    message_id: msg.message_id,
                    reply_markup: { inline_keyboard }
                });
            } catch (e) {
                 console.error("editMessageMedia error:", e);
                 // Fallback if edit fails
                 bot.deleteMessage(msg.chat.id, msg.message_id).catch();
                 bot.sendPhoto(msg.chat.id, photoFileId, { caption: text, parse_mode: 'HTML', reply_markup: { inline_keyboard }});
            }
            bot.answerCallbackQuery(callbackQuery.id);
        }
        else if (data.startsWith('buy_coin:')) {
            const planKey = data.split(':')[1];
            const plan = plans[planKey];
            if (!plan) return bot.answerCallbackQuery(callbackQuery.id);
            
            // Save selection to temp_data
            await updateUser(tgId, { 
                stage: 'stage_3_payment', 
                temp_data: { plan: plan.name, days: plan.days, coins: plan.coins, price: plan.price }
            });

            const text = `
Zoom Coin
🛍️: ${plan.name}
🗓️: ${plan.days} Days
🪙: ${plan.coins} Coins
💰: ${plan.price} ks

ဝယ်ယူရန် Payment ရွေးချယ်ပါ။
အခြားသော Mobile Banking နှင့် အခြား Payment Method များအတွက် @touzainanboku051226 သို့ဆက်သွယ်ပါ။
            `;
            const inline_keyboard = [
                [
                    { text: "WavePay", callback_data: "pay:WavePay" },
                    { text: "KBZPay", callback_data: "pay:KBZPay" }
                ],
                [
                    { text: "AYAPay", callback_data: "pay:AYAPay" },
                    { text: "UABPay", callback_data: "pay:UABPay" }
                ],
                [ { text: "⬅️ Back", callback_data: "back_to_plans" } ] // <-- Back button
            ];
            
            // Edit the photo message caption
            bot.editMessageCaption(text, {
                chat_id: msg.chat.id,
                message_id: msg.message_id,
                reply_markup: { inline_keyboard }
            });

            bot.answerCallbackQuery(callbackQuery.id);
        }
        else if (data.startsWith('pay:')) {
            const paymentType = data.split(':')[1];
            const paymentInfo = paymentDetails[paymentType];
            const tempOrder = user.temp_data;
            
            if (!paymentInfo || !tempOrder || !tempOrder.plan) {
                 bot.answerCallbackQuery(callbackQuery.id, { text: "Error. Please /start again." });
                 return;
            }

            await updateUser(tgId, { stage: 'awaiting_payment_proof' }); // Stage now awaits photo

            const text = `
🛍️: ${tempOrder.plan}
🗓️: ${tempOrder.days} Days
🪙: ${tempOrder.coins} Coins
💰: ${tempOrder.price} ks

ငွေလက်ခံနံပါတ်အား ${tempOrder.price} ks တိတိလွှဲပေးပါ။

<b>${paymentType}</b>
${paymentInfo}

သတိ - Note မှာ သင့်အကောင့်နာမည်ရေးပေးပါ။

Zoom Pro နှင့်သက်ဆိုင်သော Note များလုံးဝ၊ လုံးဝမရေးပေးရန် မတ္တာရပ်ခံအပ်ပါသည်။

ငွေလွှဲပြေစာ (Screenshot) အားပေးပို့ပေးပါ။
            `;
            // Back button goes back to payment *method* selection
            const inline_keyboard = [[ { text: "⬅️ Back", callback_data: `buy_coin:${tempOrder.plan}` } ]];
            
            bot.editMessageCaption(text, {
                chat_id: msg.chat.id,
                message_id: msg.message_id,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard }
            });

            bot.answerCallbackQuery(callbackQuery.id);
        }
        else if (data === 'buy_license_prompt') {
            await updateUser(tgId, { stage: 'prompt_email', temp_data: {} });
            bot.sendMessage(tgId, "လူကြီးမင်း၏ emailအားပို့ပေးပါ။");
            bot.deleteMessage(msg.chat.id, msg.message_id); // clean up button
            bot.answerCallbackQuery(callbackQuery.id);
        }
        else if (data.startsWith('select_license:')) {
            const planKey = data.split(':')[1];
            const plan = plans[planKey];
            const email = user.temp_data.email;
            
            if (!plan || !email) return bot.answerCallbackQuery(callbackQuery.id, {text: "Error, please /zoom again."});

            // Check balance
            if (user.coin_balance < plan.coins) {
                bot.answerCallbackQuery(callbackQuery.id, { 
                    text: `Insufficient balance. You need ${plan.coins} coins, but you only have ${user.coin_balance}.`,
                    show_alert: true 
                });
                return;
            }
            
            // Save plan to temp_data
            await updateUser(tgId, { 
                stage: 'confirming_license',
                temp_data: { ...user.temp_data, ...plan } // Spread the whole plan object
            });

            const expiryDate = moment().tz(MYANMAR_TZ).add(plan.days, 'days').format("DD/MM/YY");
            const text = `
Zoom License
✉️: ${email}
🛍️: ${plan.name}
🪙: ${plan.coins} Coin
🗓️: ${plan.days} Days

ယခုဝယ်ယူပါက ကုန်ဆုံးမည့်သတ်တမ်း - ${expiryDate}

ဝယ်ယူလိုပါက Confirm ကိုနှိပ်ပေးပါ
            `;
            const inline_keyboard = [
                [ { text: "✅ Confirm", callback_data: "confirm_license_purchase" } ],
                [ { text: "⬅️ Back", callback_data: "back_to_license_plan_selection" } ] // <-- Back button
            ];
            
            bot.editMessageText(text, {
                chat_id: msg.chat.id,
                message_id: msg.message_id,
                reply_markup: { inline_keyboard }
            });
            bot.answerCallbackQuery(callbackQuery.id);
        }
        else if (data === 'confirm_license_purchase') {
            const licenseData = user.temp_data;
            if (!licenseData || !licenseData.email || !licenseData.coins) {
                return bot.answerCallbackQuery(callbackQuery.id, {text: "Error, please /zoom again."});
            }
            
            // 1. Check balance again
            if (user.coin_balance < licenseData.coins) {
                 return bot.answerCallbackQuery(callbackQuery.id, { text: `Insufficient balance.`, show_alert: true });
            }

            // 2. Deduct coins
            await supabase.rpc('decrement_coin_balance', { user_id_in: tgId, coins_to_subtract: licenseData.coins });

            // 3. Create license entry
            const expires_at = moment().tz(MYANMAR_TZ).add(licenseData.days, 'days').toISOString();
            
            // ----- THIS IS THE CORRECTED BLOCK -----
            const { data: newLicense, error } = await supabase
                .from('licenses')
                .insert({
                    user_id: tgId,
                    email: licenseData.email,
                    plan_name: licenseData.name, // Use .name from the spread plan object
                    coins_spent: licenseData.coins,
                    days: licenseData.days,
                    status: 'pending',
                    expires_at: expires_at
                })
                .select()
                .single();
            // ----- END OF CORRECTED BLOCK -----

            if (error) {
                console.error("Error creating license:", error);
                // Refund coins if insert fails
                await supabase.rpc('increment_coin_balance', { user_id_in: tgId, coins_to_add: licenseData.coins });
                bot.editMessageText("License order failed. Your coins have been refunded.", {
                    chat_id: msg.chat.id,
                    message_id: msg.message_id
                });
                return bot.answerCallbackQuery(callbackQuery.id, {text: "Error creating license. Coins refunded."});
            }
            
            // 4. Send to admin group
            const groupId = await getSetting('group_id');
            const topicId = await getSetting('license_topic_id');
            const adminCaption = `
Zoom License (Pending)
🚹: ${user.first_name}
🔗: <a href="tg://user?id=${user.tg_id}">Link to Profile</a>
👤: ${user.username ? `@${user.username}` : 'N_A'}
🆔: ${user.tg_id}

Zoom License
✉️: ${licenseData.email}
🛍️: ${licenseData.name}
🪙: ${licenseData.coins} Coin
🗓️: ${licenseData.days} Days
            `;
            const admin_keyboard = [[
                { text: "✅ Finished", callback_data: `admin_finish_license:${tgId}:${newLicense.license_id}` },
                { text: "❌ Decline", callback_data: `admin_decline_license:${tgId}:${newLicense.license_id}:${licenseData.coins}` }
            ]];

            try {
                 const sentAdminMsg = await bot.sendMessage(groupId, adminCaption, {
                    parse_mode: 'HTML',
                    message_thread_id: topicId,
                    reply_markup: { inline_keyboard: admin_keyboard }
                });
                 // Save admin message_id to license table for future reference
                 await supabase.from('licenses').update({ license_message_id: sentAdminMsg.message_id }).eq('license_id', newLicense.license_id);

            } catch (e) { console.error("Error sending license to admin:", e); }

            // 5. Notify user
            bot.editMessageText("Zoom License အား Orderတင်ပြီးပါပြီ။ ခေတ္တခဏစောင့်ဆိုင်းပေးပါ။", {
                chat_id: msg.chat.id,
                message_id: msg.message_id,
                reply_markup: { inline_keyboard: [] }
            });
            
            // 6. Clear stage
            await updateUser(tgId, { stage: 'start', temp_data: {} });
            bot.answerCallbackQuery(callbackQuery.id);
        }
        
        // --- NEW: Back Buttons Logic ---
        
        else if (data === 'back_to_start') {
            // Edit the photo message back to the original start text message
            await showStartMenu(msg.chat.id, callbackQuery.from, msg.message_id);
            bot.answerCallbackQuery(callbackQuery.id);
        }
        else if (data === 'back_to_plans') {
            // Edit the payment method message back to the plans message (which is the photo + caption)
            await updateUser(tgId, { stage: 'stage_2_plans' });
            
            const photoFileId = await getSetting('promo_photo_file_id');
            if (!photoFileId) {
                bot.answerCallbackQuery(callbackQuery.id, { text: "Error: Photo not set by admin." });
                return;
            }

            const text = `
Zoom Pro ဝယ်ယူရာတွင် ကျွန်တော်တို့ဖက်မှ အကောင်းဆုံးဝန်ဆောင်မှုပေးထားပါတယ်ခင်ဗျာ။

<b>[Zoom Bot ကိုဘယ်လိုအသုံးပြုမလဲ။]</b>

လူကြီးမင်းအနေနဲ့ Zoom Coin အားအရင်ဝယ်ယူရပါမယ်ခင်ဗျ။ (Zoom Coin ၁ ခုလျှင် Zoom License အား 14 ရက်ကြာအသုံးပြုနိုင်ပါသည်။)

မိမိအသုံးပြုလိုသောနေ့တွင် ယခု Bot သို့ /zoom ဟုပေးပို့၍ အသုံးပြုနိုင်ပါသည်။

Coin 1 ခုလျှင် ၁၄ ရက်သာ Zoom License အားရရှိမည်ဖြစ်ပြီး မိမိထပ်မံ့အသုံးပြုလိုလျှင် အထက်တွင်ပြထားသည့်အတိုင်း ပြန်လည်ပြုလုပ်၍အသုံးပြုနိုင်ပါသည်။

Zoom Coin လက်ကျန်စစ်ဆေးလိုပါက /balance ဟုပေးပို့၍ စစ်ဆေးနိုင်ပါသည်။

Zoom Pro Pricing and Plan
            `;
            const inline_keyboard = [
                [
                    { text: "1Month", callback_data: "buy_coin:1Month" },
                    { text: "3Months", callback_data: "buy_coin:3Months" }
                ],
                [
                    { text: "6Months", callback_data: "buy_coin:6Months" },
                    { text: "12Months", callback_data: "buy_coin:12Months" }
                ],
                [ { text: "⬅️ Back", callback_data: "back_to_start" } ]
            ];
            
            try {
                // We are editing the caption of a photo message
                await bot.editMessageCaption(text, {
                    chat_id: msg.chat.id,
                    message_id: msg.message_id,
                    parse_mode: 'HTML',
                    reply_markup: { inline_keyboard }
                });
            } catch (e) {
                console.error("Back to plans (edit caption) failed:", e.message);
            }
            bot.answerCallbackQuery(callbackQuery.id);
        }
        else if (data === 'back_to_license_plan_selection') {
            // Edit the "Confirm License" message back to "Select Plan"
            const email = user.temp_data.email;
            if (!email) { 
                bot.answerCallbackQuery(callbackQuery.id, { text: "Error. Please /zoom again."});
                return;
            }

            const text = `
✉️: ${email}
ဝယ်ယူလိုသည့် Plan အားရွေးချယ်ပေးပါ။
            `;
            const inline_keyboard = [
                [
                    { text: "1Month", callback_data: `select_license:1Month` },
                    { text: "3Months", callback_data: `select_license:3Months` }
                ],
                [
                    { text: "6Months", callback_data: `select_license:6Months` },
                    { text: "12Months", callback_data: `select_license:12Months` }
                ],
                [ { text: "⬅️ Back", callback_data: "back_to_email_prompt" } ]
            ];
            
            await updateUser(tgId, { stage: 'selecting_license_plan' }); // Keep temp_data
            
            bot.editMessageText(text, {
                chat_id: msg.chat.id,
                message_id: msg.message_id,
                reply_markup: { inline_keyboard }
            });
            bot.answerCallbackQuery(callbackQuery.id);
        }
        else if (data === 'back_to_email_prompt') {
            // Edit the "Select Plan" message back to "Send Email"
            await updateUser(tgId, { stage: 'prompt_email', temp_data: {} });
            bot.editMessageText("လူကြီးမင်း၏ emailအားပို့ပေးပါ။", {
                chat_id: msg.chat.id,
                message_id: msg.message_id,
                reply_markup: { inline_keyboard: [] }
            });
            bot.answerCallbackQuery(callbackQuery.id);
        }

    } catch (e) {
        console.error("User Callback Error:", e);
        bot.answerCallbackQuery(callbackQuery.id, { text: "An error occurred." });
    }
});

// --- Scheduled Task (Check Expirations) ---
async function checkExpirations() {
    console.log("Running expiration check...");
    const now = moment().tz(MYANMAR_TZ);
    const oneDayFromNow = moment(now).add(1, 'day');

    // 1. Find licenses expiring soon for reminder
    const { data: expiringSoon, error: soonError } = await supabase
        .from('licenses')
        .select('*')
        .eq('status', 'active')
        .eq('reminded', false)
        .lte('expires_at', oneDayFromNow.toISOString())
        .gte('expires_at', now.toISOString());

    if (soonError) console.error("Error fetching expiring soon:", soonError);

    if (expiringSoon) {
        for (const license of expiringSoon) {
            const reminderMsg = `
✉️: ${license.email}
🛍️: ${license.plan_name}
🪙: ${license.coins_spent} Coin
🗓️: ${license.days} Days

မကြာမီသတ်တမ်းကုန်ဆုံးပါတော့မည်။ ထပ်မံသက်တမ်းတိုးလိုပါက /start ကိုနှိပ်ကာ Zoom Coinများဝယ်ယူနိုင်ပါသည်။
            `;
            try {
                bot.sendMessage(license.user_id, reminderMsg);
                await supabase.from('licenses').update({ reminded: true }).eq('license_id', license.license_id);
            } catch (e) { console.error("Error sending reminder:", e); }
        }
    }

    // 2. Find licenses that are now expired
    const { data: expired, error: expiredError } = await supabase
        .from('licenses')
        .select('*, users(first_name, username)') // Join with users table
        .eq('status', 'active')
        .lte('expires_at', now.toISOString());
    
    if (expiredError) console.error("Error fetching expired:", expiredError);

    if (expired) {
        const groupId = await getSetting('group_id');
        const expiredTopicId = await getSetting('license_expired_topic_id');
        const finishedTopicId = await getSetting('license_finished_topic_id');

        for (const license of expired) {
            await supabase.from('licenses').update({ status: 'expired' }).eq('license_id', license.license_id);
            
            if (groupId && expiredTopicId) {
                // Log to expired topic
                const userName = license.users ? license.users.first_name : 'Unknown User';
                const userUsername = license.users ? license.users.username : 'N/A';
                
                const expiredLog = `
License (Expired)
🚹: ${userName}
👤: @${userUsername}
🆔: ${license.user_id}
✉️: ${license.email}
🛍️: ${license.plan_name}
Expired On: ${formatMyanmarTime(license.expires_at)}
                `;
                try {
                    bot.sendMessage(groupId, expiredLog, { 
                        message_thread_id: expiredTopicId,
                        parse_mode: 'HTML'
                    });
                } catch(e) { console.error("Error logging expired license:", e); }
            }
        }
    }
}

// Run the check every hour
setInterval(checkExpirations, 3600 * 1000); 
checkExpirations(); // Run once on start

console.log("Bot (v2 with Back Buttons) is running...");
            
