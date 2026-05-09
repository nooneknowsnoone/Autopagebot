require('dotenv').config(); // Add this at the very top of your file

const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');
const memory = require('../utils/memoryManager');

// Configuration - Now using environment variable
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.5-flash";

// Add validation to ensure API key exists
if (!API_KEY) {
    console.error('❌ GEMINI_API_KEY not found in .env file!');
    process.exit(1);
}

function makeBold(text) {
  return text.replace(/\*\*(.+?)\*\*/g, (match, word) => {
    let boldText = '';
    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      if (char >= 'a' && char <= 'z') {
        boldText += String.fromCharCode(char.charCodeAt(0) + 0x1D41A - 97);
      } else if (char >= 'A' && char <= 'Z') {
        boldText += String.fromCharCode(char.charCodeAt(0) + 0x1D400 - 65);
      } else if (char >= '0' && char <= '9') {
        boldText += String.fromCharCode(char.charCodeAt(0) + 0x1D7CE - 48);
      } else {
        boldText += char;
      }
    }
    return boldText;
  });
}

function splitMessage(text) {
  const maxLength = 1900;
  const chunks = [];

  for (let i = 0; i < text.length; i += maxLength) {
    chunks.push(text.slice(i, i + maxLength));
  }

  return chunks;
}

// Function to extract image URL from message if present
function extractImageUrl(message) {
  // Check for common image URL patterns
  const urlPattern = /(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp))/i;
  const match = message.match(urlPattern);
  return match ? match[0] : null;
}

module.exports = {
    name: ['ai'],
    usage: 'ai [question] or ai reset',
    version: '1.0.0',
    author: 'AutoPagebot',
    category: 'ai',
    cooldown: 5,

    async execute(senderId, args, pageAccessToken, event, sendMessageFunc, imageCache) {
        const message = args.join(' ');
        const imageUrl = extractImageUrl(message);

        // Clean message by removing image URL if present
        let cleanMessage = message;
        if (imageUrl) {
            cleanMessage = message.replace(imageUrl, '').trim();
        }

        if (!args.length) {
            const stats = memory.getStats(senderId);
            return sendMessage(senderId, { 
                text: `🤖 𝗖𝗼𝗻𝘃𝗲𝗿𝘀𝗮𝘁𝗶𝗼𝗻𝗮𝗹 𝗔𝗜 (Gemini Vision)

📝 Usage: ai [your question]

✨ Examples:
• ai Hello! My name is John
• ai What's my name? (remembers context)
• ai Tell me a joke
• ai What's in this image? https://example.com/image.jpg

🔄 Commands:
• ai reset - Clear conversation history
• ai stats - Show conversation stats

📊 Session: ${stats.messageCount} messages

💡 The AI remembers your conversation and can analyze images!`
            }, pageAccessToken);
        }

        // Handle reset command
        if (cleanMessage.toLowerCase() === 'reset' || cleanMessage.toLowerCase() === 'clear') {
            memory.clearConversation(senderId);
            return sendMessage(senderId, {
                text: '🧹 Conversation history cleared from memory/conversations.json!\n\n💬 Start a fresh conversation.'
            }, pageAccessToken);
        }

        // Handle stats command
        if (cleanMessage.toLowerCase() === 'stats') {
            const stats = memory.getStats(senderId);
            const lastActive = new Date(stats.lastActive).toLocaleString('en-PH', {
                timeZone: 'Asia/Manila'
            });
            const created = new Date(stats.createdAt).toLocaleString('en-PH', {
                timeZone: 'Asia/Manila'
            });

            return sendMessage(senderId, {
                text: `📊 𝗖𝗼𝗻𝘃𝗲𝗿𝘀𝗮𝘁𝗶𝗼𝗻 𝗦𝘁𝗮𝘁𝘀

• Messages: ${stats.messageCount}
• Created: ${created}
• Last active: ${lastActive}
• Storage: memory/conversations.json

💡 Use "ai reset" to clear history`
            }, pageAccessToken);
        }

        if (!cleanMessage) {
            return sendMessage(senderId, {
                text: '❌ Please provide a question!\n\nExample: ai What is this? https://example.com/image.jpg'
            }, pageAccessToken);
        }

        const header = '💬 | 𝗔𝗜 𝗔𝘀𝘀𝗶𝘀𝘁𝗮𝗻𝘁\n・────────────・\n';
        const footer = '\n・────────────・';

        // Build context from conversation history
        const context = memory.getContext(senderId, 10);

        // Prepare conversation for Gemini
        let conversation = [];

        if (context) {
            // Parse previous messages from context
            const contextLines = context.split('\n');
            for (let i = 0; i < contextLines.length; i++) {
                const line = contextLines[i];
                if (line.startsWith('User: ')) {
                    conversation.push({ role: 'user', parts: [{ text: line.substring(6) }] });
                } else if (line.startsWith('Assistant: ')) {
                    conversation.push({ role: 'model', parts: [{ text: line.substring(11) }] });
                }
            }
        }

        // Build current user message with image if available
        const parts = [{ text: cleanMessage }];

        if (imageUrl) {
            try {
                // Fetch and convert image to base64
                const imageResp = await axios.get(imageUrl, { 
                    responseType: 'arraybuffer',
                    timeout: 15000
                });
                const imageData = Buffer.from(imageResp.data, 'binary').toString('base64');
                parts.push({
                    inline_data: {
                        mime_type: 'image/jpeg',
                        data: imageData
                    }
                });
            } catch (imageError) {
                console.error('Image fetch error:', imageError.message);
                await sendMessage(senderId, {
                    text: header + '❌ Failed to fetch image from URL. Please check the URL and try again.' + footer
                }, pageAccessToken);
                return;
            }
        }

        // Add current user message
        conversation.push({ role: 'user', parts });

        // Prepare payload for Gemini API
        const payload = {
            contents: conversation
        };

        let aiResponse = null;

        try {
            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
                payload,
                {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                        'Content-Type': 'application/json'
                    },
                    timeout: 45000
                }
            );

            if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                aiResponse = response.data.candidates[0].content.parts[0].text;
                console.log(`✅ Gemini API request successful`);
            } else {
                throw new Error('Invalid response from Gemini API');
            }
        } catch (error) {
            console.error('Gemini API Error:', error.message);
            await sendMessage(senderId, {
                text: header + '❌ API request failed. Please try again later.\n\n💡 Tip: The server might be busy!' + footer
            }, pageAccessToken);
            return;
        }

        if (!aiResponse) {
            await sendMessage(senderId, {
                text: header + '❌ Failed to get response from AI. Please try again.' + footer
            }, pageAccessToken);
            return;
        }

        // Save to conversation memory
        memory.addMessage(senderId, 'user', cleanMessage);
        memory.addMessage(senderId, 'assistant', aiResponse);

        aiResponse = aiResponse.trim();
        aiResponse = makeBold(aiResponse);

        const chunks = splitMessage(aiResponse);

        for (let i = 0; i < chunks.length; i++) {
            const isFirst = i === 0;
            const isLast = i === chunks.length - 1;

            let fullMessage = chunks[i];
            if (isFirst) fullMessage = header + fullMessage;
            if (isLast) fullMessage = fullMessage + footer;

            await sendMessage(senderId, { text: fullMessage }, pageAccessToken);
        }
    }
};