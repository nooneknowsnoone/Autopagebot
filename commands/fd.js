const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
    name: ['feedback', 'report', 'suggest'],
    usage: 'feedback <your message>',
    version: '1.0.0',
    author: 'AutoPageBot',
    category: 'system',
    cooldown: 30,

    async execute(senderId, args, pageAccessToken, event, sendMessageFunc, imageCache) {
        // Admin configuration
        const ADMIN_UID = '6158923309617'; // Admin Facebook UID
        const ADMIN_PAGE_TOKEN = pageAccessToken; // Using same page token
        
        // Check if message is provided
        if (!args || args.length === 0) {
            await sendMessage(senderId, { 
                text: `📝 FEEDBACK COMMAND

📌 Usage: feedback <your message>

✨ Examples:
• feedback The bot is awesome!
• feedback I found a bug when using download command
• feedback Suggestion: Add more commands
• feedback Report: Command not working

💡 Your feedback helps improve the bot!
🔒 Messages are sent privately to admin.

📝 Aliases: report, suggest`
            }, pageAccessToken);
            return;
        }

        const feedbackMessage = args.join(' ');
        const timestamp = new Date().toLocaleString('en-PH', {
            timeZone: 'Asia/Manila',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });

        // Send confirmation to user
        await sendMessage(senderId, { 
            text: `📝 Feedback received!

✅ Your message has been sent to the admin.

📋 Your feedback:
"${feedbackMessage}"

📅 Sent at: ${timestamp}

🙏 Thank you for your feedback!`
        }, pageAccessToken);

        // Try to get user info for better feedback context
        let userName = 'Unknown User';
        let userProfileUrl = '';
        
        try {
            const userInfo = await axios.get(`https://graph.facebook.com/v23.0/${senderId}?access_token=${pageAccessToken}&fields=name,profile_pic`);
            if (userInfo.data && userInfo.data.name) {
                userName = userInfo.data.name;
                userProfileUrl = userInfo.data.profile_pic || '';
            }
        } catch (error) {
            console.error('Failed to fetch user info:', error.message);
        }

        // Determine feedback type
        let feedbackType = 'General Feedback';
        const commandUsed = args[0].toLowerCase();
        if (commandUsed === 'report') {
            feedbackType = 'Bug Report';
        } else if (commandUsed === 'suggest') {
            feedbackType = 'Suggestion';
        }

        // Prepare feedback for admin
        const adminFeedback = `📝 NEW FEEDBACK RECEIVED

━━━━━━━━━━━━━━━━━━━━
👤 USER INFORMATION
━━━━━━━━━━━━━━━━━━━━
• Name: ${userName}
• UID: ${senderId}
• Profile: https://facebook.com/${senderId}

━━━━━━━━━━━━━━━━━━━━
💬 FEEDBACK MESSAGE
━━━━━━━━━━━━━━━━━━━━
"${feedbackMessage}"

━━━━━━━━━━━━━━━━━━━━
📅 TIMESTAMP
━━━━━━━━━━━━━━━━━━━━
${timestamp}

━━━━━━━━━━━━━━━━━━━━
🔧 FEEDBACK TYPE
━━━━━━━━━━━━━━━━━━━━
${feedbackType}

━━━━━━━━━━━━━━━━━━━━
💡 REPLY TO THIS USER
━━━━━━━━━━━━━━━━━━━━
Use: reply ${senderId} <your message>`;

        try {
            // Send to admin via Messenger
            await axios.post(
                `https://graph.facebook.com/v23.0/me/messages?access_token=${ADMIN_PAGE_TOKEN}`,
                {
                    recipient: { id: ADMIN_UID },
                    message: { text: adminFeedback }
                }
            );

            // If user provided profile picture, send it as attachment
            if (userProfileUrl) {
                try {
                    await axios.post(
                        `https://graph.facebook.com/v23.0/me/messages?access_token=${ADMIN_PAGE_TOKEN}`,
                        {
                            recipient: { id: ADMIN_UID },
                            message: {
                                attachment: {
                                    type: 'image',
                                    payload: { url: userProfileUrl, is_reusable: true }
                                }
                            }
                        }
                    );
                } catch (imageError) {
                    console.error('Failed to send profile image:', imageError.message);
                }
            }

            console.log(`✅ Feedback sent to admin ${ADMIN_UID} from user ${senderId}`);

        } catch (error) {
            console.error('Failed to send feedback to admin:', error.message);
            
            // Notify user if admin delivery failed
            await sendMessage(senderId, { 
                text: `⚠️ Your feedback was received but couldn't be delivered to admin due to technical issues. The developers have been notified.`
            }, pageAccessToken);
        }
    }
};