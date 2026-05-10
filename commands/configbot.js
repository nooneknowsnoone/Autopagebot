const { sendMessage } = require('../handles/sendMessage');
const tokenManager = require('../handles/tokenManager');

module.exports = {
    name: ['addbot', 'addpage', 'connectpage', 'newbot', 'botconfig'],
    description: 'Add/Connect a Facebook page bot using Page Access Token. Also shows webhook config info.',
    usage: 'addbot <page_token> [page_name] [owner_name] | addbot disconnect <token> | addbot config',
    version: '1.0.0',
    author: 'AutoPageBot',
    category: 'system',
    cooldown: 10,

    async execute(senderId, args, pageAccessToken, event, sendMessageFunc, imageCache) {
        // Handle config command - show webhook info
        if (args && args.length > 0 && args[0].toLowerCase() === 'config') {
            await showWebhookConfig(senderId, pageAccessToken);
            return;
        }
        
        if (!args || args.length === 0) {
            await sendMessage(senderId, { 
                text: `🤖 *Add Bot Command Usage*\n\n` +
                      `📌 *To add a new bot:*\n` +
                      `addbot <PAGE_TOKEN> [page_name] [owner_name]\n\n` +
                      `📝 *Example:*\n` +
                      `addbot EAAH... "My Cool Page" "John Doe"\n\n` +
                      `🔌 *To disconnect a bot:*\n` +
                      `addbot disconnect <PAGE_TOKEN>\n\n` +
                      `⚙️ *To see webhook config:*\n` +
                      `addbot config\n\n` +
                      `*Note:* Page Token is required. Page name and owner name are optional.`
            }, pageAccessToken);
            return;
        }
        
        // Check if it's a disconnect command
        if (args[0].toLowerCase() === 'disconnect') {
            await handleDisconnect(senderId, args.slice(1), pageAccessToken);
            return;
        }
        
        // Handle connect command
        await handleConnect(senderId, args, pageAccessToken);
    }
};

// Show webhook configuration information
async function showWebhookConfig(senderId, pageAccessToken) {
    try {
        const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
        const host = process.env.HOST || require('os').hostname() || 'localhost';
        const port = process.env.PORT || 3000;
        
        // Get public IP or domain
        let publicUrl = process.env.PUBLIC_URL || '';
        if (!publicUrl) {
            try {
                const ipRes = await fetch('https://api.ipify.org?format=json');
                const ipData = await ipRes.json();
                publicUrl = `${protocol}://${ipData.ip}:${port}`;
            } catch (e) {
                publicUrl = `${protocol}://${host}:${port}`;
            }
        }
        
        const webhookUrl = `${publicUrl}/webhook`;
        const verifyToken = 'autopagebot';
        
        const configMessage = `🔧 *Facebook Webhook Configuration*\n\n` +
                              `━━━━━━━━━━━━━━━━━━━━\n\n` +
                              `📡 *Webhook URL:*\n` +
                              `${webhookUrl}\n\n` +
                              `🔐 *Verify Token:*\n` +
                              `${verifyToken}\n\n` +
                              `📋 *API Version:*\n` +
                              `v23.0\n\n` +
                              `━━━━━━━━━━━━━━━━━━━━\n\n` +
                              `*How to configure your Facebook App:*\n\n` +
                              `1️⃣ Go to developers.facebook.com/apps\n` +
                              `2️⃣ Select your app → Messenger → Settings\n` +
                              `3️⃣ Click "Add Callback URL"\n` +
                              `4️⃣ Paste the Webhook URL above\n` +
                              `5️⃣ Enter Verify Token: ${verifyToken}\n` +
                              `6️⃣ Verify and save\n` +
                              `7️⃣ Subscribe to events: messages, messaging_postbacks\n\n` +
                              `⚠️ *Important:* Make sure your server is publicly accessible!\n` +
                              `💡 For local testing, use ngrok or similar tunneling service.`;
        
        await sendMessage(senderId, { text: configMessage }, pageAccessToken);
        
    } catch (error) {
        console.error('Error showing webhook config:', error);
        await sendMessage(senderId, { text: `❌ Failed to get webhook config: ${error.message}` }, pageAccessToken);
    }
}

// Handle connecting a new page
async function handleConnect(senderId, args, pageAccessToken) {
    try {
        let pageToken = args[0];
        let pageName = '';
        let ownerName = '';
        
        // Parse optional arguments
        if (args.length > 1) {
            // Check if there are quoted strings or just plain arguments
            const fullArgs = args.join(' ');
            const match = fullArgs.match(/"([^"]+)"|'([^']+)'|(\S+)/g);
            
            if (match && match.length > 1) {
                // Remove quotes if present
                let nameIndex = 1;
                if (match[1] && (match[1].startsWith('"') || match[1].startsWith("'"))) {
                    pageName = match[1].replace(/^["']|["']$/g, '');
                    nameIndex = 2;
                } else {
                    pageName = match[1];
                    nameIndex = 2;
                }
                
                if (match[nameIndex] && (match[nameIndex].startsWith('"') || match[nameIndex].startsWith("'"))) {
                    ownerName = match[nameIndex].replace(/^["']|["']$/g, '');
                } else if (match[nameIndex]) {
                    ownerName = match[nameIndex];
                }
            } else if (args.length > 1) {
                pageName = args[1];
                if (args.length > 2) ownerName = args[2];
            }
        }
        
        // Validate token format
        if (!pageToken || pageToken.length < 20) {
            await sendMessage(senderId, { text: '❌ Invalid Page Token. Please provide a valid Facebook Page Access Token.' }, pageAccessToken);
            return;
        }
        
        await sendMessage(senderId, { text: '🔄 Verifying token and connecting page...' }, pageAccessToken);
        
        // Verify token and get page info
        const response = await fetch(`https://graph.facebook.com/v23.0/me?access_token=${pageToken}`);
        const data = await response.json();
        
        if (data.error) {
            await sendMessage(senderId, { text: `❌ Invalid Token: ${data.error.message}\n\nPlease check your Page Access Token and try again.` }, pageAccessToken);
            return;
        }
        
        const pageId = data.id;
        const name = pageName || data.name || 'Unnamed Page';
        const username = data.username || pageId;
        const finalOwnerName = ownerName || 'Connected via Command';
        
        // Check if page already connected
        const existing = await tokenManager.getToken(pageId);
        if (existing) {
            await sendMessage(senderId, { 
                text: `⚠️ Page "${existing.name}" is already connected!\n\n` +
                      `📄 Page ID: ${pageId}\n` +
                      `👤 Connected by: ${existing.owner}\n` +
                      `📅 Connected at: ${new Date(existing.connectedAt).toLocaleString()}\n\n` +
                      `🔌 To disconnect, use: addbot disconnect ${pageToken.substring(0, 20)}...` 
            }, pageAccessToken);
            return;
        }
        
        // Get webhook URL for configuration info
        const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
        const host = process.env.HOST || 'localhost';
        const port = process.env.PORT || 3000;
        let publicUrl = process.env.PUBLIC_URL || `${protocol}://${host}:${port}`;
        
        try {
            const ipRes = await fetch('https://api.ipify.org?format=json');
            const ipData = await ipRes.json();
            publicUrl = `${protocol}://${ipData.ip}:${port}`;
        } catch (e) {
            // Use default
        }
        
        const webhookUrl = `${publicUrl}/webhook`;
        const verifyToken = 'autopagebot';
        
        // Add the token
        await tokenManager.addToken(pageId, {
            token: pageToken,
            name: name,
            username: username,
            owner: finalOwnerName,
            connectedAt: new Date().toISOString(),
            lastActive: new Date().toISOString(),
            connectedVia: 'command',
            connectedBy: senderId
        });
        
        // Setup webhook for the page
        try {
            await setupPageWebhook(pageId, pageToken, webhookUrl, verifyToken);
        } catch (webhookError) {
            console.error('Webhook setup error:', webhookError);
            // Continue even if webhook setup fails - can be configured manually
        }
        
        // Send success message with webhook config
        const successMessage = `✅ *Bot Connected Successfully!*\n\n` +
                              `━━━━━━━━━━━━━━━━━━━━\n` +
                              `📄 *Page Name:* ${name}\n` +
                              `🆔 *Page ID:* ${pageId}\n` +
                              `👤 *Owner:* ${finalOwnerName}\n` +
                              `🔗 *Username:* @${username}\n` +
                              `📅 *Connected:* ${new Date().toLocaleString()}\n` +
                              `━━━━━━━━━━━━━━━━━━━━\n\n` +
                              `🔧 *Facebook Webhook Setup:*\n\n` +
                              `📡 *Webhook URL:*\n${webhookUrl}\n\n` +
                              `🔐 *Verify Token:*\n${verifyToken}\n\n` +
                              `━━━━━━━━━━━━━━━━━━━━\n\n` +
                              `💡 *Messenger Link:*\nm.me/${username}\n\n` +
                              `🔌 *To disconnect this page:*\n` +
                              `addbot disconnect ${pageToken.substring(0, 15)}...\n\n` +
                              `⚙️ *To see webhook config again:*\n` +
                              `addbot config`;
        
        await sendMessage(senderId, { text: successMessage }, pageAccessToken);
        
        // Also send a test message
        setTimeout(async () => {
            await sendMessage(senderId, { text: '🎉 Bot is now active! Make sure your webhook is properly configured in Facebook App.' }, pageAccessToken);
        }, 2000);
        
        console.log(`✅ New bot connected via command: ${name} (${pageId}) by ${finalOwnerName}`);
        
    } catch (error) {
        console.error('Error in handleConnect:', error);
        await sendMessage(senderId, { text: `❌ Failed to connect page: ${error.message}\n\nPlease try again later.` }, pageAccessToken);
    }
}

// Handle disconnecting a page
async function handleDisconnect(senderId, args, pageAccessToken) {
    try {
        if (args.length === 0) {
            await sendMessage(senderId, { 
                text: `🔌 *Disconnect Bot Usage*\n\n` +
                      `To disconnect a bot, provide the Page Token:\n` +
                      `addbot disconnect <PAGE_TOKEN>\n\n` +
                      `📝 *Example:*\n` +
                      `addbot disconnect EAAH...\n\n` +
                      `📋 *To see all connected pages, use:*\n` +
                      `listsessions` 
            }, pageAccessToken);
            return;
        }
        
        const pageToken = args[0];
        
        if (!pageToken || pageToken.length < 10) {
            await sendMessage(senderId, { text: '❌ Please provide a valid Page Token to disconnect.' }, pageAccessToken);
            return;
        }
        
        await sendMessage(senderId, { text: '🔄 Verifying token and finding page...' }, pageAccessToken);
        
        // Verify token to get page ID
        const response = await fetch(`https://graph.facebook.com/v23.0/me?access_token=${pageToken}`);
        const data = await response.json();
        
        if (data.error) {
            await sendMessage(senderId, { text: `❌ Invalid Token: ${data.error.message}\n\nCannot identify page to disconnect.` }, pageAccessToken);
            return;
        }
        
        const pageId = data.id;
        const tokenData = await tokenManager.getToken(pageId);
        
        if (!tokenData) {
            await sendMessage(senderId, { text: `❌ No active session found for this token.\n\nPage ID: ${pageId}\nThis page is not connected to this bot.` }, pageAccessToken);
            return;
        }
        
        // Perform disconnect without confirmation for simplicity
        await tokenManager.removeToken(pageId);
        
        const successMessage = `✅ *Page Disconnected Successfully!*\n\n` +
                              `📄 Page: ${tokenData.name}\n` +
                              `🆔 ID: ${pageId}\n` +
                              `👤 Owner: ${tokenData.owner}\n` +
                              `📅 Connected until: ${new Date(tokenData.connectedAt).toLocaleString()}\n\n` +
                              `The bot will no longer respond to messages from this page.\n\n` +
                              `💡 To reconnect, use: addbot <new_token>`;
        
        await sendMessage(senderId, { text: successMessage }, pageAccessToken);
        console.log(`🔌 Page disconnected via command: ${tokenData.name} (${pageId}) by ${senderId}`);
        
    } catch (error) {
        console.error('Error in handleDisconnect:', error);
        await sendMessage(senderId, { text: `❌ Failed to disconnect: ${error.message}` }, pageAccessToken);
    }
}

// Setup webhook for a page
async function setupPageWebhook(pageId, pageToken, webhookUrl, verifyToken) {
    try {
        // Subscribe app to page
        const subscribeRes = await fetch(`https://graph.facebook.com/v23.0/${pageId}/subscribed_apps?access_token=${pageToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (subscribeRes.ok) {
            console.log(`✅ Webhook subscription configured for page ${pageId}`);
        }
        
        // Set up messenger profile webhook
        await fetch(`https://graph.facebook.com/v23.0/me/messenger_profile?access_token=${pageToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                webhook: {
                    url: webhookUrl,
                    verify_token: verifyToken
                },
                fields: ['messages', 'messaging_postbacks', 'messaging_optins']
            })
        }).catch(() => null);
        
    } catch (error) {
        console.error(`Failed to setup webhook for ${pageId}:`, error.message);
        // Don't throw - webhook can be set up manually
    }
}