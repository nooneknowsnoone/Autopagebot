const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: ['blur'],
  usage: 'Send an image and type "blur" to apply blur effect',
  version: '1.0.0',
  author: 'AutoPageBot',
  category: 'images',
  cooldown: 0,

  async execute(senderId, args, pageAccessToken, imageUrl) {
    if (!imageUrl) {
      return sendMessage(senderId, {
        text: `❌ 𝗣𝗹𝗲𝗮𝘀𝗲 𝘀𝗲𝗻𝗱 𝗮𝗻 𝗶𝗺𝗮𝗴𝗲 𝗳𝗶𝗿𝘀𝘁, 𝘁𝗵𝗲𝗻 𝘁𝘆𝗽𝗲 "𝗯𝗹𝘂𝗿" 𝘁𝗼 𝗮𝗽𝗽𝗹𝘆 𝗯𝗹𝘂𝗿 𝗲𝗳𝗳𝗲𝗰𝘁.`
      }, pageAccessToken);
    }

    await sendMessage(senderId, { text: '🔄 𝗔𝗽𝗽𝗹𝘆𝗶𝗻𝗴 𝗯𝗹𝘂𝗿 𝗲𝗳𝗳𝗲𝗰𝘁, 𝗽𝗹𝗲𝗮𝘀𝗲 𝘄𝗮𝗶𝘁...' }, pageAccessToken);

    try {
      const blurUrl = `https://api.popcat.xyz/v2/blur?image=${encodeURIComponent(imageUrl)}`;

      await sendMessage(senderId, {
        attachment: {
          type: 'image',
          payload: {
            url: blurUrl
          }
        }
      }, pageAccessToken);

    } catch (error) {
      console.error('Blur Error:', error?.response?.data || error.message);
      await sendMessage(senderId, {
        text: '❌ An error occurred while applying the blur effect. Please try again later.'
      }, pageAccessToken);
    }
  }
};