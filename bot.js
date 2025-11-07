// -----------------------------------------------------------------
// Part 1: Setup, Helpers, and Owner Commands (UPDATED)
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

const ownerAlertId = 1936169054;
const adminAlertId = 7655451892;
// *** NEW: Super Admin IDs for DM commands ***
const superAdminIds = new Set([botOwnerId, ownerAlertId, adminAlertId]);

const bot = new TelegramBot(token, { polling: true });
const supabase = createClient(supabaseUrl, supabaseKey);

// Myanmar Timezone
const MYANMAR_TZ = "Asia/Yangon";

// --- Global Variables ---
let broadcastJobs = {}; // For broadcast feature

// --- Plan Details (Object for easy access) ---
const plans = {
    '1Month': { name: '1Month', days: 28, coins: 2, price: 17000 },
    '3Months': { name: '3Months', days: 84, coins: 6, price: 45000 },
    '6Months': { name: '6Months', days: 168, coins: 13, price: 81000 },
    '12Months': { name: '12Months', days: 336, coins: 26, price: 149000 },
    '14Days': { name: '14Days', days: 14, coins: 1 } 
};

const paymentDetails = {
    'WavePay': 'Name: Ko Ko Thar Htet\nPhNo.: 09753661355',
    'KBZPay': 'Name: Ko Ko Thar Htet\nPhNo.: 09427275188',
    'AYAPay': 'Name: Ko Ko Thar Htet\nPhNo.: 09427275188',
    'UABPay': 'Name: Ko Ko Thar Htet\nPhNo.: 09753661355'
};

// --- Helper Functions ---

// Delay function
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

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
        try {
            await bot.editMessageText(welcomeMsg, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: { inline_keyboard }
            });
        } catch (e) {
            await bot.sendMessage(chatId, welcomeMsg, {
                reply_markup: { inline_keyboard }
            });
        }
    } else {
        await bot.sendMessage(chatId, welcomeMsg, {
            reply_markup: { inline_keyboard }
        });
    }
}


// --- Owner Commands ---
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
bot.onText(/\/setphoto/, async (msg) => {
    if (msg.from.id !== botOwnerId) return;
    await updateUser(msg.from.id, { stage: 'awaiting_photo' });
    bot.sendMessage(msg.chat.id, "OK, Owner. Please send me the new promo photo.");
});
bot.onText(/\/support (.+)/, (msg, match) => {
    handleSetCommand(msg, 'support_topic_id', 'Support Topic ID');
});
bot.onText(/\/broadcast (.+)/, (msg, match) => {
    handleSetCommand(msg, 'broadcast_topic_id', 'Broadcast Topic ID');
});
bot.onText(/\/botsetting (.+)/, (msg, match) => {
    handleSetCommand(msg, 'bot_setting_topic_id', 'Bot Setting Topic ID');
});

// --- User Commands ---
bot.onText(/\/start/, async (msg) => {
    const tgId = msg.from.id;
    const { user, isNew } = await getUser(tgId, msg.from.first_name, msg.from.username);
    if (!user) return;

    if (isNew) {
        const groupId = await getSetting('group_id');
        const topicId = await getSetting('new_customer_topic_id');
        
        const alertMsg = `
New Customer Alert
🚹: ${user.first_name}
👤: ${user.username ? `@${user.username}` : 'N/A'}
🔗: <a href="tg://user?id=${user.tg_id}">Link to Profile</a>
🆔: ${user.tg_id}
🗓️: ${formatMyanmarTime()}
        `;
        const targets = [
            { chatId: ownerAlertId, topicId: null },
            { chatId: adminAlertId, topicId: null }
        ];
        if (groupId && topicId) {
            targets.push({ chatId: groupId, topicId: topicId });
        }
        for (const target of targets) {
            try {
                await bot.sendMessage(target.chatId, alertMsg, {
                    parse_mode: 'HTML',
                    message_thread_id: target.topicId || undefined
                });
            } catch (e) {
                console.error(`Failed to send new user alert to ${target.chatId}:`, e.message);
            }
        }
    }
    await showStartMenu(msg.chat.id, msg.from);
});

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

bot.onText(/\/zoom/, async (msg) => {
    const tgId = msg.from.id;
    await updateUser(tgId, { stage: 'prompt_email', temp_data: {} });
    bot.sendMessage(msg.chat.id, "လူကြီးမင်း၏ emailအားပို့ပေးပါ။");
});

// --- Admin Commands (Broadcast & Send) ---
async function startBroadcast(msg, type) {
    const groupId = await getSetting('group_id');
    const broadcastTopicId = await getSetting('broadcast_topic_id');
    if (!groupId || !broadcastTopicId || msg.chat.id.toString() !== groupId || msg.message_thread_id.toString() !== broadcastTopicId) {
        return bot.sendMessage(msg.chat.id, "This command can only be used in the broadcast topic.", { message_thread_id: msg.message_thread_id });
    }
    const isAdmin = await isChatAdmin(groupId, msg.from.id);
    if (!isAdmin) return;
    const admin_id = msg.from.id;
    if (broadcastJobs[admin_id]) {
        return bot.sendMessage(msg.chat.id, "You have a pending broadcast. Cancel it first.", { message_thread_id: broadcastTopicId });
    }
    broadcastJobs[admin_id] = { type: type, messages: [], chatId: msg.chat.id, topicId: broadcastTopicId };
    bot.sendMessage(msg.chat.id,
        "Broadcast mode started. Send me messages/photos to collect.\n\nPress '✅ Send Broadcast' when done.",
        {
            message_thread_id: broadcastTopicId,
            reply_markup: {
                keyboard: [
                    [{ text: '✅ Send Broadcast' }, { text: '❌ Cancel' }]
                ],
                resize_keyboard: true
            }
        });
}

bot.onText(/\/broadcast1/, (msg) => startBroadcast(msg, 'copy'));
bot.onText(/\/broadcast2/, (msg) => startBroadcast(msg, 'forward'));

bot.onText(/\/send (\d+) (.+)/s, async (msg, match) => {
    const groupId = await getSetting('group_id');
    const supportTopicId = await getSetting('support_topic_id');
    if (!groupId || !supportTopicId || msg.chat.id.toString() !== groupId || msg.message_thread_id.toString() !== supportTopicId) {
        return bot.sendMessage(msg.chat.id, "This command can only be used in the support topic.", { message_thread_id: msg.message_thread_id });
    }
    const isAdmin = await isChatAdmin(groupId, msg.from.id);
    if (!isAdmin) return;
    const targetUserId = match[1];
    const messageText = match[2];
    try {
        await bot.sendMessage(targetUserId, messageText);
        bot.sendMessage(msg.chat.id, `Message sent to ${targetUserId}.`, { message_thread_id: supportTopicId });
    } catch (e) {
        console.error("Error sending message:", e);
        bot.sendMessage(msg.chat.id, `Failed to send message: ${e.message}`, { message_thread_id: supportTopicId });
    }
});

// --- *** Bot Setting Topic Helper Functions *** ---

// Helper function for batch sending (to avoid 4096 char limit)
async function sendBatchedMessages(chatId, topicId, messages) {
    const MESSAGE_LIMIT = 4096;
    let currentMessage = "";

    for (const message of messages) {
        if (currentMessage.length + message.length + 1 > MESSAGE_LIMIT) {
            try {
                await bot.sendMessage(chatId, currentMessage, { 
                    message_thread_id: topicId, // This is fine if topicId is undefined (for DMs)
                    parse_mode: 'HTML',
                    disable_web_page_preview: true
                });
            } catch (e) { console.error("Error sending batched message:", e.message); }
            currentMessage = message + "\n";
        } else {
            currentMessage += message + "\n";
        }
    }
    // Send the last batch
    if (currentMessage) {
        try {
            await bot.sendMessage(chatId, currentMessage, { 
                message_thread_id: topicId,
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });
        } catch (e) { console.error("Error sending last batched message:", e.message); }
    }
}

// *** MODIFIED: Security check helper for bot setting topic commands OR DM ***
async function isAuthorizedAdmin(msg) {
    // Scenario 1: Check if it's a Super Admin in DM
    if (msg.chat.type === 'private') {
        if (superAdminIds.has(msg.from.id)) {
            return true; // Authorized
        } else {
            bot.sendMessage(msg.chat.id, "You are not authorized for this command.");
            return false; // Not authorized
        }
    }

    // Scenario 2: Check if it's an Admin in the Bot Setting Topic
    const groupId = await getSetting('group_id');
    const settingTopicId = await getSetting('bot_setting_topic_id');

    if (groupId && settingTopicId && msg.chat.id.toString() === groupId && msg.message_thread_id.toString() === settingTopicId) {
        const isAdmin = await isChatAdmin(groupId, msg.from.id);
        if (isAdmin) {
            return true; // Authorized (Group Admin in topic)
        } else {
            bot.sendMessage(msg.chat.id, "You are not an admin in this group.", { message_thread_id: msg.message_thread_id });
            return false; // Not authorized
        }
    }

    // Scenario 3: Not in DM and not in the correct topic
    if (msg.chat.type === 'supergroup' || msg.chat.type === 'group') {
         bot.sendMessage(msg.chat.id, "This command can only be used in the Bot Setting topic or in DM.", { message_thread_id: msg.message_thread_id });
    }
    return false;
}


// --- *** Admin Commands (List, Balance, Refresh) *** ---

bot.onText(/\/list/, async (msg) => {
    // Use new authorization check
    if (!await isAuthorizedAdmin(msg)) return;

    // replyTopicId will be undefined in DM, which is correct
    const replyTopicId = msg.message_thread_id; 
    bot.sendMessage(msg.chat.id, "Fetching user list... This may take a moment.", { message_thread_id: replyTopicId });

    const { data: users, error } = await supabase
        .from('users')
        .select('tg_id, first_name, username');
        
    if (error) {
        console.error("Error fetching users for /list:", error);
        return bot.sendMessage(msg.chat.id, "Error fetching users from DB.", { message_thread_id: replyTopicId });
    }
    if (!users || users.length === 0) {
        return bot.sendMessage(msg.chat.id, "No users found in database.", { message_thread_id: replyTopicId });
    }
    
    const userMessages = users.map(user => {
        return `
👤: <a href="tg://user?id=${user.tg_id}">${user.first_name || 'No Name'}</a>
🔗: ${user.username ? `@${user.username}` : 'N/A'}
🆔: \`${user.tg_id}\`
--------------------`;
    });

    await sendBatchedMessages(msg.chat.id, replyTopicId, userMessages);
});

bot.onText(/\/userbalance/, async (msg) => {
    if (!await isAuthorizedAdmin(msg)) return;
    
    const replyTopicId = msg.message_thread_id;
    bot.sendMessage(msg.chat.id, "Fetching user balances... This may take a moment.", { message_thread_id: replyTopicId });

    const { data: users, error } = await supabase
        .from('users')
        .select('tg_id, first_name, coin_balance')
        .order('coin_balance', { ascending: false }); // Order by balance
        
    if (error) {
        console.error("Error fetching users for /userbalance:", error);
        return bot.sendMessage(msg.chat.id, "Error fetching users from DB.", { message_thread_id: replyTopicId });
    }
    if (!users || users.length === 0) {
        return bot.sendMessage(msg.chat.id, "No users found in database.", { message_thread_id: replyTopicId });
    }
    
    const userMessages = users.map(user => {
        return `
👤: <a href="tg://user?id=${user.tg_id}">${user.first_name || 'No Name'}</a>
🪙: ${user.coin_balance || 0} Coins
--------------------`;
    });

    await sendBatchedMessages(msg.chat.id, replyTopicId, userMessages);
});

bot.onText(/\/loadnew/, async (msg) => {
    if (!await isAuthorizedAdmin(msg)) return;

    const replyTopicId = msg.message_thread_id;
    bot.sendMessage(msg.chat.id, "Starting user data refresh... This will take time. Please wait.", { message_thread_id: replyTopicId });

    const { data: users, error } = await supabase
        .from('users')
        .select('tg_id, first_name, username');
        
    if (error || !users) {
        return bot.sendMessage(msg.chat.id, "Error fetching users from DB.", { message_thread_id: replyTopicId });
    }

    let updatedCount = 0;
    let failedCount = 0;

    for (const user of users) {
        try {
            const chat = await bot.getChat(user.tg_id);
            const newFirstName = chat.first_name;
            const newUsername = chat.username;

            let updates = {};
            if (newFirstName !== user.first_name) {
                updates.first_name = newFirstName;
            }
            if (newUsername !== user.username) {
                updates.username = newUsername || 'N/A';
            }

            if (Object.keys(updates).length > 0) {
                const { error: updateError } = await supabase
                    .from('users')
                    .update(updates)
                    .eq('tg_id', user.tg_id);
                
                if (updateError) {
                    console.error(`Failed to update user ${user.tg_id}:`, updateError.message);
                    failedCount++;
                } else {
                    updatedCount++;
                }
            }
        } catch (e) {
            console.error(`Failed to getChat for ${user.tg_id}:`, e.message);
            if (e.response && e.response.statusCode === 403) {
                 // User blocked the bot.
            }
            failedCount++;
        }
        await delay(500); // 500ms delay to avoid rate limits
    }
    
    bot.sendMessage(msg.chat.id, 
        `✅ User data refresh complete.
        
Total Users Checked: ${users.length}
Users Updated: ${updatedCount}
Users Failed (e.g., blocked bot): ${failedCount}`, 
        { message_thread_id: replyTopicId }
    );
});
// -----------------------------------------------------------------
// Part 2/3: Message Handlers and Broadcast Function
// -----------------------------------------------------------------

// --- General Message Handler (Text & Photo) ---
bot.on('message', async (msg) => {
    // Ignore commands (already handled by onText)
    if (msg.text && msg.text.startsWith('/')) return;

    const tgId = msg.from.id;
    const { user } = await getUser(tgId, msg.from.first_name, msg.from.username);
    if (!user) return;

    const stage = user.stage;
    const groupId = await getSetting('group_id');

    // --- 1. Handle Admin Broadcast Message Collection ---
    const broadcastTopicId = await getSetting('broadcast_topic_id');
    if (broadcastJobs[tgId] && msg.chat.id.toString() === groupId && msg.message_thread_id.toString() === broadcastTopicId) {
        
        // Handle 'Send' button
        if (msg.text === '✅ Send Broadcast') {
            const job = broadcastJobs[tgId];
            if (job.messages.length === 0) {
                return bot.sendMessage(msg.chat.id, "No messages collected. Add some messages first.", { message_thread_id: broadcastTopicId });
            }
            
            // Remove keyboard and confirm
            await bot.sendMessage(msg.chat.id, `Starting broadcast... Sending ${job.messages.length} message(s).`, {
                message_thread_id: broadcastTopicId,
                reply_markup: { remove_keyboard: true }
            });

            // Start sending
            sendBroadcast(tgId, job);
            delete broadcastJobs[tgId]; // Clear job
            return;
        }
        
        // Handle 'Cancel' button
        else if (msg.text === '❌ Cancel') {
            delete broadcastJobs[tgId]; // Clear job
            await bot.sendMessage(msg.chat.id, "Broadcast cancelled.", {
                message_thread_id: broadcastTopicId,
                reply_markup: { remove_keyboard: true }
            });
            return;
        }

        // Collect message
        else {
            broadcastJobs[tgId].messages.push(msg.message_id);
            await bot.sendMessage(msg.chat.id, `Message ${broadcastJobs[tgId].messages.length} collected.`, { message_thread_id: broadcastTopicId });
            return;
        }
    }

    // --- 2. Handle Admin Reply in Support Topic ---
    const supportTopicId = await getSetting('support_topic_id');
    if (msg.reply_to_message && msg.reply_to_message.from.is_bot &&
        groupId && msg.chat.id.toString() === groupId && msg.message_thread_id.toString() === supportTopicId) {
        
        const isAdmin = await isChatAdmin(groupId, tgId);
        if (!isAdmin) return; // Only admins can reply

        const replyHandlerText = msg.reply_to_message.text;
        if (replyHandlerText && replyHandlerText.includes("Reply to this message to chat with")) {
            
            // Extract customer_id from the handler message
            const match = replyHandlerText.match(/TG ID: (\d+)/);
            if (match && match[1]) {
                const customer_tg_id = match[1];
                try {
                    // 1. Send admin's message to customer (copy, no forward)
                    await bot.copyMessage(customer_tg_id, msg.chat.id, msg.message_id);
                    
                    // 2. Delete the bot's "Reply Handler" message
                    await bot.deleteMessage(msg.chat.id, msg.reply_to_message.message_id);

                    // Note: We leave the customer's original (copied) message
                    // and the admin's reply (msg) in the topic, as requested.
                } catch (e) {
                    console.error("Error handling admin reply:", e);
                    bot.sendMessage(msg.chat.id, `Failed to send reply to ${customer_tg_id}: ${e.message}`, { message_thread_id: supportTopicId });
                }
            }
            return; // Handled
        }
    }

    // --- 3. Handle User Workflow Stages (Payment, Email) ---
    if (msg.chat.type === 'private') {
        // Photo for promo photo
        if (msg.photo && stage === 'awaiting_photo' && tgId === botOwnerId) {
            const photoFileId = msg.photo[msg.photo.length - 1].file_id;
            await setSetting('promo_photo_file_id', photoFileId);
            await updateUser(tgId, { stage: 'start' });
            bot.sendMessage(tgId, "✅ Promo photo updated successfully!");
            return;
        }
        // Photo for payment proof
        else if (msg.photo && stage === 'awaiting_payment_proof') {
            const tempOrder = user.temp_data;
            if (!tempOrder || !tempOrder.plan) {
                bot.sendMessage(tgId, "An error occurred. Please start over with /start.");
                return;
            }
            bot.sendMessage(tgId, "သင့်၏ ပြေစာအားစစ်ဆေး‌နေပါသည်။။ ခတ္တခဏစောင့်ဆိုင်းပေးပါ။");
            
            // 1. Create order in DB
            const { data: newOrder, error } = await supabase.from('orders').insert({
                user_id: tgId, plan_name: tempOrder.plan, days: tempOrder.days,
                coins: tempOrder.coins, price: tempOrder.price, status: 'pending'
            }).select().single();

            if (error) {
                console.error("Error creating order:", error);
                bot.sendMessage(tgId, "Order တင်ရာတွင် အမှားအယွင်းဖြစ်သွားပါသည်။");
                return;
            }

            // 2. Send screenshot to admin group
            const orderTopicId = await getSetting('order_topic_id');
            if (!groupId || !orderTopicId) {
                console.error("Order topic not set!"); return;
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
                    caption: caption, parse_mode: 'HTML', message_thread_id: orderTopicId,
                    reply_markup: { inline_keyboard }
                });
                await supabase.from('orders').update({ payment_message_id: sentMsg.message_id }).eq('order_id', newOrder.order_id);
            } catch (e) { console.error("Error sending order to admin:", e); }

            await updateUser(tgId, { stage: 'start', temp_data: {} });
            return;
        }
        
        // License Purchase Flow
        else if (msg.text && stage === 'prompt_email') {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(msg.text)) {
                bot.sendMessage(tgId, "Email format မမှန်ပါ။ Email အမှန်ကိုပြန်ပို့ပေးပါ။");
                return;
            }
            const email = msg.text.trim();
            
            const plan = plans['14Days'];
            const expiryDate = moment().tz(MYANMAR_TZ).add(plan.days, 'days').format("DD/MM/YY");

            const text = `
✉️: ${email}
🏷️: Zoom License ${plan.days}days
🪙: ${plan.coins} Coin
🗓️: ${expiryDate}

Zoom License အားဝယ်ယူမည်ဆိုပါက Confirm နှိပ်ပေးပါ
            `;
            
            const inline_keyboard = [
                [{ text: "✅ Confirm", callback_data: "confirm_license_purchase" }],
                [{ text: "❌ Cancel", callback_data: "back_to_email_prompt" }]
            ];
            
            await updateUser(tgId, { 
                stage: 'confirming_license', 
                temp_data: { 
                    email: email, 
                    name: plan.name,
                    days: plan.days,
                    coins: plan.coins
                } 
            });
            
            bot.sendMessage(tgId, text, { reply_markup: { inline_keyboard } });
            return;
        }

        // --- 4. Handle General Support Message (Default Case) ---
        if (groupId && supportTopicId) {
            try {
                // 1. Copy customer's message to support topic (no "forwarded from")
                const copiedMsg = await bot.copyMessage(groupId, msg.chat.id, msg.message_id, {
                    message_thread_id: supportTopicId
                });

                // 2. Send the handler message
                const handlerText = `
New Support Message
🚹: ${user.first_name}
👤: ${user.username ? `@${user.username}` : 'N/A'}
🆔: ${user.tg_id}

---
Reply to this message to chat with ${user.first_name}.
(Internal Info: TG ID: ${user.tg_id})
                `;
                await bot.sendMessage(groupId, handlerText, {
                    message_thread_id: supportTopicId,
                });

            } catch (e) {
                console.error("Error forwarding message to support:", e);
            }
        }
    }
});


// --- Broadcast Sender Function ---
async function sendBroadcast(admin_id, job) {
    const { data: users, error } = await supabase.from('users').select('tg_id');
    if (error || !users) {
        console.error("Broadcast: Failed to fetch users");
        return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const user of users) {
        try {
            for (const message_id of job.messages) {
                if (job.type === 'copy') {
                    await bot.copyMessage(user.tg_id, job.chatId, message_id);
                } else { // 'forward'
                    await bot.forwardMessage(user.tg_id, job.chatId, message_id);
                }
            }
            successCount++;
        } catch (e) {
            console.error(`Failed to broadcast to ${user.tg_id}: ${e.message}`);
            failCount++;
        }
        await delay(300); // 300ms delay per user to avoid rate limits
    }

    // Send summary to admin
    bot.sendMessage(job.chatId, 
        `Broadcast complete.\n✅ Success: ${successCount}\n❌ Failed: ${failCount}`,
        { message_thread_id: job.topicId }
    );
}
// -----------------------------------------------------------------
// Part 3/3: Callback Query Handler (Admin Logic)
// -----------------------------------------------------------------

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
                
                // 1. Update user balance (WITH ERROR CHECKING)
                const { error: rpcError } = await supabase.rpc('increment_coin_balance', { 
                    user_id_in: userId, 
                    coins_to_add: coinsToAdd 
                });

                if (rpcError) { 
                    console.error("Supabase RPC Error (increment_coin_balance):", rpcError);
                    bot.answerCallbackQuery(callbackQuery.id, { 
                        text: "Error: Failed to update balance. Check logs.",
                        show_alert: true 
                    });
                    return; 
                }
                
                // 2. Update order status
                await supabase.from('orders').update({ status: 'accepted' }).eq('order_id', orderId);

                // 3. Edit message in order topic (This is a photo, so use editMessageCaption)
                await bot.editMessageCaption(msg.caption.replace("Order (Pending)", "Order (✅ Accepted)"), {
                    chat_id: msg.chat.id, message_id: msg.message_id,
                    parse_mode: 'HTML', reply_markup: { inline_keyboard: [] }
                });

                // 4. Forward to finished topic
                try {
                    const finishedTopicId = await getSetting('order_finished_topic_id');
                    if (finishedTopicId) {
                        await bot.forwardMessage(msg.chat.id, msg.chat.id, msg.message_id, { message_thread_id: finishedTopicId });
                    }
                } catch (fwdError) { console.error("Failed to forward ACCEPTED order:", fwdError.message); }
                
                // 5. Delete from original Order Topic
                await bot.deleteMessage(msg.chat.id, msg.message_id);

                // 6. Notify user (Split Message + Delay)
                const successMsg = `
Zoom Coin - [${coinsToAdd}] အားထည့်သွင်းပြီးပါပြီ။

ဝယ်ယူအားပေးမှုအတွက် အထူးကျေးဇူးတင်ရှ်ိပါသည်။

မိမိသူငယ်ချင်းများနှင့် မိတ်ဆွေ၊ မိသားစုများကိုလည်း လမ်းညွှန်ခြင်းဖြင့် ကျွန်ုပ်တို့အား ကူညီနိုင်ပါသည်။

ကျွန်တော်တို့၏ Telegram Channel
https://t.me/KoKos_Daily_Dose_of_Madness
                `;
                bot.sendMessage(userId, successMsg);

                await delay(2000); // 2-second delay

                const followUpMsg = "Zoom License ကိုဝယ်ယူလိုပါက (ဝယ်ယူရန်) ကိုနှိပ်ပေးပါ။";
                bot.sendMessage(userId, followUpMsg, {
                    reply_markup: {
                        inline_keyboard: [[ { text: "ဝယ်ယူရန်", callback_data: "buy_license_prompt" } ]]
                    }
                });
                
                bot.answerCallbackQuery(callbackQuery.id, { text: "Order Accepted!" });
            }
            else if (action === 'admin_decline_order') {
                // This is a photo, so use editMessageCaption
                await bot.editMessageCaption(msg.caption.replace("Order (Pending)", "Order (❌ Declined)"), {
                    chat_id: msg.chat.id, message_id: msg.message_id,
                    parse_mode: 'HTML', reply_markup: { inline_keyboard: [] }
                });
                await bot.deleteMessage(msg.chat.id, msg.message_id);
                bot.sendMessage(userId, "Your order has been declined. Please contact admin.");
                bot.answerCallbackQuery(callbackQuery.id, { text: "Order Declined!" });
            }
            else if (action === 'admin_finish_license') {
                const licenseId = parseInt(orderIdStr);
                const { data: license, error: licenseError } = await supabase.from('licenses').select('*').eq('license_id', licenseId).single();
                
                if (licenseError || !license) return bot.answerCallbackQuery(callbackQuery.id, { text: "License not found."});
                if (license.status !== 'pending') return bot.answerCallbackQuery(callbackQuery.id, { text: "License already processed."});

                const { data: licenseUser, error: userError } = await supabase.from('users').select('coin_balance').eq('tg_id', userId).single();
                
                if (userError || !licenseUser) return bot.answerCallbackQuery(callbackQuery.id, { text: "User not found."});
                if (licenseUser.coin_balance < license.coins_spent) {
                    return bot.answerCallbackQuery(callbackQuery.id, { 
                        text: `Failed: User only has ${licenseUser.coin_balance} coins. (Needed ${license.coins_spent}).`,
                        show_alert: true
                    });
                }

                // 3. Deduct coins
                const { error: rpcError } = await supabase.rpc('decrement_coin_balance', { 
                    user_id_in: userId, coins_to_subtract: license.coins_spent 
                });
                if (rpcError) { 
                    console.error("Supabase RPC Error (decrement_coin_balance):", rpcError);
                    bot.answerCallbackQuery(callbackQuery.id, { 
                        text: "Error: Failed to deduct balance. Check logs.",
                        show_alert: true 
                    });
                    return; 
                }

                // 4. Update license status
                await supabase.from('licenses').update({ status: 'active' }).eq('license_id', licenseId);

                // 5. Edit message in topic (TEXT message)
                await bot.editMessageText(msg.text.replace("Zoom License (Pending)", "Zoom License (✅ Finished)"), {
                    chat_id: msg.chat.id, message_id: msg.message_id,
                    parse_mode: 'HTML', reply_markup: { inline_keyboard: [] }
                });

                // 6. Forward to finished topic
                try {
                    const finishedTopicId = await getSetting('license_finished_topic_id');
                    if (finishedTopicId) {
                        await bot.forwardMessage(msg.chat.id, msg.chat.id, msg.message_id, { message_thread_id: finishedTopicId });
                    }
                } catch (fwdError) { console.error("Failed to forward FINISHED license:", fwdError.message); }

                // 7. Delete from original License Topic
                await bot.deleteMessage(msg.chat.id, msg.message_id);

                // 8. Notify user
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
                const licenseId = parseInt(orderIdStr);
                await supabase.from('licenses').update({ status: 'declined' }).eq('license_id', licenseId);
                await bot.editMessageText(msg.text.replace("Zoom License (Pending)", "Zoom License (❌ Declined)"), {
                    chat_id: msg.chat.id, message_id: msg.message_id,
                    parse_mode: 'HTML', reply_markup: { inline_keyboard: [] }
                });
                await bot.deleteMessage(msg.chat.id, msg.message_id);
                bot.sendMessage(userId, "Your License order has been declined. No coins were deducted. Please contact admin.");
                bot.answerCallbackQuery(callbackQuery.id, { text: "License Declined!" });
            }
        } catch (e) {
            console.error("Admin Callback Error:", e);
            bot.answerCallbackQuery(callbackQuery.id, { text: "An error occurred." });
        }
        return;
    }
// CONTINUE TO PART 4
// -----------------------------------------------------------------
// Part 4/3: Callback Query (User Logic) & Scheduled Tasks
// -----------------------------------------------------------------

    // --- USER-FACING BUTTONS (in private chat) ---
    try {
        if (data === 'buy_zoom_prompt') {
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
                [{ text: "1Month", callback_data: "buy_coin:1Month" }, { text: "3Months", callback_data: "buy_coin:3Months" }],
                [{ text: "6Months", callback_data: "buy_coin:6Months" }, { text: "12Months", callback_data: "buy_coin:12Months" }],
                [{ text: "⬅️ Back", callback_data: "back_to_start" }]
            ];
            try {
                await bot.editMessageMedia({
                    type: 'photo', media: photoFileId, caption: text, parse_mode: 'HTML'
                }, {
                    chat_id: msg.chat.id, message_id: msg.message_id, reply_markup: { inline_keyboard }
                });
            } catch (e) {
                 console.error("editMessageMedia error:", e);
                 bot.deleteMessage(msg.chat.id, msg.message_id).catch();
                 bot.sendPhoto(msg.chat.id, photoFileId, { caption: text, parse_mode: 'HTML', reply_markup: { inline_keyboard }});
            }
            bot.answerCallbackQuery(callbackQuery.id);
        }
        else if (data.startsWith('buy_coin:')) {
            const planKey = data.split(':')[1];
            const plan = plans[planKey];
            if (!plan) return bot.answerCallbackQuery(callbackQuery.id);
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
                [{ text: "WavePay", callback_data: "pay:WavePay" }, { text: "KBZPay", callback_data: "pay:KBZPay" }],
                [{ text: "AYAPay", callback_data: "pay:AYAPay" }, { text: "UABPay", callback_data: "pay:UABPay" }],
                [{ text: "⬅️ Back", callback_data: "back_to_plans" }]
            ];
            bot.editMessageCaption(text, {
                chat_id: msg.chat.id, message_id: msg.message_id, reply_markup: { inline_keyboard }
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
            await updateUser(tgId, { stage: 'awaiting_payment_proof' });
            const text = `
🛍️: ${tempOrder.plan}
🗓️: ${tempOrder.days} Days
🪙: ${tempOrder.coins} Coins
💰: ${tempOrder.price} ks

ငွေလက်ခံနံပါတ်အား ${tempOrder.price} ks တိတိလွှဲပေးပါ။

<b>${paymentType}</b>
${paymentInfo}

သတိ - Note မှာ Zoom Pro ဟုရေးပေးပါ။

ငွေလွှဲပြေစာ (Screenshot) အားပေးပို့ပေးပါ။
            `;
            const inline_keyboard = [[ { text: "⬅️ Back", callback_data: `buy_coin:${tempOrder.plan}` } ]];
            bot.editMessageCaption(text, {
                chat_id: msg.chat.id, message_id: msg.message_id,
                parse_mode: 'HTML', reply_markup: { inline_keyboard }
            });
            bot.answerCallbackQuery(callbackQuery.id);
        }
        else if (data === 'buy_license_prompt') {
            await updateUser(tgId, { stage: 'prompt_email', temp_data: {} });
            bot.sendMessage(tgId, "လူကြီးမင်း၏ emailအားပို့ပေးပါ။");
            try {
                bot.deleteMessage(msg.chat.id, msg.message_id); 
            } catch (e) { /* ignore */ }
            bot.answerCallbackQuery(callbackQuery.id);
        }
        
        else if (data === 'confirm_license_purchase') {
            const licenseData = user.temp_data;
            if (!licenseData || !licenseData.email || !licenseData.coins) {
                return bot.answerCallbackQuery(callbackQuery.id, {text: "Error, please /zoom again."});
            }
            if (user.coin_balance < licenseData.coins) {
                 return bot.answerCallbackQuery(callbackQuery.id, { 
                    text: `Insufficient balance. You need ${licenseData.coins} coin(s), but you only have ${user.coin_balance}.`,
                    show_alert: true 
                });
            }

            const expires_at = moment().tz(MYANMAR_TZ).add(licenseData.days, 'days').toISOString();
            const { data: newLicense, error } = await supabase.from('licenses').insert({
                user_id: tgId, email: licenseData.email, plan_name: licenseData.name,
                coins_spent: licenseData.coins, days: licenseData.days,
                status: 'pending', expires_at: expires_at
            }).select().single();
            if (error) {
                console.error("Error creating license:", error);
                bot.editMessageText("License order failed. Please try again.", {
                    chat_id: msg.chat.id, message_id: msg.message_id
                });
                return bot.answerCallbackQuery(callbackQuery.id, {text: "Error creating license."});
            }
            
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
                { text: "❌ Decline", callback_data: `admin_decline_license:${tgId}:${newLicense.license_id}` }
            ]];
            try {
                 const sentAdminMsg = await bot.sendMessage(groupId, adminCaption, {
                    parse_mode: 'HTML', message_thread_id: topicId, reply_markup: { inline_keyboard: admin_keyboard }
                });
                 await supabase.from('licenses').update({ license_message_id: sentAdminMsg.message_id }).eq('license_id', newLicense.license_id);
            } catch (e) { console.error("Error sending license to admin:", e); }

            bot.editMessageText("Zoom License အား Orderတင်ပြီးပါပြီ။ ခေတ္တခဏစောင့်ဆိုင်းပေးပါ။", {
                chat_id: msg.chat.id, message_id: msg.message_id, reply_markup: { inline_keyboard: [] }
            });
            
            await updateUser(tgId, { stage: 'start', temp_data: {} });
            bot.answerCallbackQuery(callbackQuery.id);
        }
        
        // --- Back Buttons Logic ---
        
        else if (data === 'back_to_start') {
            await showStartMenu(msg.chat.id, callbackQuery.from, msg.message_id);
            bot.answerCallbackQuery(callbackQuery.id);
        }
        else if (data === 'back_to_plans') {
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
                [{ text: "1Month", callback_data: "buy_coin:1Month" }, { text: "3Months", callback_data: "buy_coin:3Months" }],
                [{ text: "6Months", callback_data: "buy_coin:6Months" }, { text: "12Months", callback_data: "buy_coin:12Months" }],
                [{ text: "⬅️ Back", callback_data: "back_to_start" }]
            ];
            try {
                await bot.editMessageCaption(text, {
                    chat_id: msg.chat.id, message_id: msg.message_id,
                    parse_mode: 'HTML', reply_markup: { inline_keyboard }
                });
            } catch (e) { console.error("Back to plans (edit caption) failed:", e.message); }
            bot.answerCallbackQuery(callbackQuery.id);
        }
        
        else if (data === 'back_to_email_prompt') {
            await updateUser(tgId, { stage: 'prompt_email', temp_data: {} });
            bot.editMessageText("လူကြီးမင်း၏ emailအားပို့ပေးပါ။", {
                chat_id: msg.chat.id, message_id: msg.message_id, reply_markup: { inline_keyboard: [] }
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

        for (const license of expired) {
            await supabase.from('licenses').update({ status: 'expired' }).eq('license_id', license.license_id);
            
            try {
                const expiryMsg = `
သင့်၏ Zoom License သတ်တမ်းကုန်ဆုံးသွားပါပြီ။
✉️: ${license.email}
🛍️: ${license.plan_name}

သတ်တမ်းထပ်မံတိုးလိုပါက အောက်ပါခလုတ်ကိုနှိပ်ပါ။
                `;
                const renewalKeyboard = {
                    inline_keyboard: [[ 
                        { text: "သတ်တမ်းတိုးရန် (Renew)", callback_data: "buy_license_prompt" } 
                    ]]
                };
                bot.sendMessage(license.user_id, expiryMsg, { reply_markup: renewalKeyboard });
            } catch (e) {
                console.error("Error sending expired notification to user:", e.message);
            }

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

console.log("Bot (v11 - Admin DM Commands) is running...");
